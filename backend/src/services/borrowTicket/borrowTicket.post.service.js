import sequelize from "../../config/dbConnection.js";
import { Op, literal } from "sequelize";

import BorrowTicket from "../../models/borrowTicket.model.js";
import BorrowItem from "../../models/borrowItem.model.js";
import BookCopy from "../../models/bookCopy.model.js";
import BookHold from "../../models/bookHold.model.js";

import { appError } from "../../utils/appError.js";
import { updateBookCopyService } from "../book/bookCopy.service.js";
import { notifyStaffBorrowCreated } from "../notification/notification.service.js";

const MAX_ITEMS = 5;
const MAX_ACTIVE_TICKETS = 3;
const CHECK_RECENT_TICKETS = 5;
const NON_ACTIVE_STATUSES = ["RETURNED", "CANCELLED"];

function toIdList(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  return String(value)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

function makeTicketCode() {
  // Không cần tuyệt đối đẹp, chỉ cần unique (DB unique constraint sẽ đảm bảo)
  return `LM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

async function pickRandomAvailableCopy(bookId, t) {
  // MySQL: ORDER BY RAND() (ok vì mỗi book thường không quá nhiều bản sao)
  const copy = await BookCopy.findOne({
    where: { book_id: Number(bookId), status: "AVAILABLE" },
    order: literal("RAND()"),
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  return copy;
}

export async function createBorrowTicketService({ memberId, book_id, bookId, hold_ids, holdIds } = {}) {
  const member_id = Number(memberId);
  if (!Number.isFinite(member_id)) throw appError("Chưa đăng nhập", 401);

  const directBookId = book_id ?? bookId;
  const holdIdList = toIdList(hold_ids ?? holdIds);

  // validate input: chỉ chọn 1 trong 2 cách
  if ((directBookId && holdIdList.length) || (!directBookId && !holdIdList.length)) {
    throw appError("Payload không hợp lệ: cần book_id (mượn trực tiếp) hoặc hold_ids (mượn từ hold)", 400);
  }

  // Tối ưu: chỉ check 5 phiếu gần nhất
  const recent = await BorrowTicket.findAll({
    where: { member_id },
    attributes: ["status"],
    order: [["requested_at", "DESC"]],
    limit: CHECK_RECENT_TICKETS,
    raw: true,
  });

  const activeCount = recent.reduce((acc, r) => (NON_ACTIVE_STATUSES.includes(r.status) ? acc : acc + 1), 0);
  if (activeCount >= MAX_ACTIVE_TICKETS) {
    throw appError(`Bạn chỉ được tạo tối đa ${MAX_ACTIVE_TICKETS} phiếu mượn đang hoạt động`, 400);
  }

  return await sequelize.transaction(async (t) => {
    // 1) Tạo ticket
    const ticket = await BorrowTicket.create(
      {
        ticket_code: makeTicketCode(),
        member_id,
        status: "PENDING",
        requested_at: new Date(),
      },
      { transaction: t }
    );

    // 2) Xác định danh sách copy sẽ mượn
    let copiesToBorrow = [];

    if (directBookId) {
      // Cách 1: mượn trực tiếp từ book (AVA)
      const copy = await pickRandomAvailableCopy(directBookId, t);
      if (!copy) throw appError("Sách hiện không còn bản sao AVAILABLE", 400);

      copiesToBorrow = [copy];
    } else {
      // Cách 2: mượn từ book-hold (HELD phải thuộc về user)
      if (holdIdList.length > MAX_ITEMS) throw appError(`Mỗi phiếu mượn tối đa ${MAX_ITEMS} cuốn`, 400);

      const holds = await BookHold.findAll({
        where: {
          hold_id: { [Op.in]: holdIdList },
          member_id,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (holds.length !== holdIdList.length) {
        throw appError("Có hold không tồn tại hoặc không thuộc về bạn", 400);
      }

      // Lấy copies tương ứng, khóa để tránh race
      const copyIds = holds.map((h) => h.copy_id);

      const copies = await BookCopy.findAll({
        where: { copy_id: { [Op.in]: copyIds } },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      const copyById = new Map(copies.map((c) => [c.copy_id, c]));
      for (const h of holds) {
        const c = copyById.get(h.copy_id);
        if (!c) throw appError("Book copy không tồn tại", 400);
        if (c.status !== "HELD") throw appError("Chỉ được mượn các book copy đang có trong giỏ sách", 400);
        copiesToBorrow.push(c);
      }

      // Xóa holds sau khi chuyển sang mượn (để tránh giữ chỗ nữa)
      await BookHold.destroy({ where: { hold_id: { [Op.in]: holdIdList } }, transaction: t });
    }

    if (copiesToBorrow.length > MAX_ITEMS) throw appError(`Mỗi phiếu mượn tối đa ${MAX_ITEMS} cuốn`, 400);

    // 3) Tạo borrow_items + cập nhật trạng thái copy: (AVA|HELD) -> BORROWED
    // Làm theo batch để tránh N+1 insert
    const itemsPayload = copiesToBorrow.map((c) => ({
      ticket_id: ticket.ticket_id,
      copy_id: c.copy_id,
      book_id: c.book_id,
      status: "BORROWED",
      returned_at: null,
      returned_by: null,
    }));

    await BorrowItem.bulkCreate(itemsPayload, { transaction: t });

    // Update status copy (tận dụng service có sẵn, nhưng truyền transaction để không bị out-of-tx)
    // Lưu ý: updateBookCopyService hiện tại có hỗ trợ transaction thì ok; nếu không, cần chỉnh service đó.
    for (const c of copiesToBorrow) {
      await updateBookCopyService(c.copy_id, { status: "BORROWED" }, { transaction: t });
    }

    // Gửi thông báo cho staff khi member tạo phiếu mượn mới
    // (gọi ngoài transaction để không ảnh hưởng logic chính)
    setImmediate(() => notifyStaffBorrowCreated(ticket));

    return {
      data: {
        ticket_code: ticket.ticket_code,
      },
    };
  });
}