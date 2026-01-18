import sequelize from "../../config/dbConnection.js";
import { Op } from "sequelize";

import BorrowItem from "../../models/borrowItem.model.js";
import BorrowTicket from "../../models/borrowTicket.model.js";

import { appError } from "../../utils/appError.js";
import { updateBookCopyService } from "../book/bookCopy.service.js";
import { recalcTotalBorrowCountForBook } from "./borrowItem.return.service.js";
import { ensureTicketReturnedIfAllItemsDone } from "./borrow-state.service.js";

const ALLOWED_ITEM_STATUS = new Set(["BORROWED", "RETURNED", "REMOVED", "CANCELLED"]);

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeStatus(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value).trim().toUpperCase();
}

/**
 * STAFF: PUT /borrow-item/:id
 * - Chuyển trạng thái borrow item theo yêu cầu
 * - Đồng bộ trạng thái book copy:
 *   - RETURNED/CANCELLED => AVAILABLE
 *   - REMOVED => REMOVED
 * - Bonus: nếu RETURNED => recalcTotalBorrowCountForBook(book_id)
 * - Nếu item chuyển RETURNED/REMOVED => có thể auto chuyển ticket sang RETURNED (yêu cầu 2b)
 */
export async function updateBorrowItemStatusService(borrowItemId, staffUserId, payload = {}, options = {}) {
  const { transaction: outerTransaction = null, forceSync = false } = options;

  const id = toInt(borrowItemId);
  if (!id) throw appError("borrowItemId không hợp lệ", 400);

  const nextStatus = normalizeStatus(payload.status);
  if (!nextStatus) throw appError("Thiếu status", 400);
  if (!ALLOWED_ITEM_STATUS.has(nextStatus)) throw appError("status không hợp lệ", 400);

  // NOTE:
  // - Staff flow (API PUT /borrow-item/:id) yêu cầu staffUserId.
  // - System flow (member cancel ticket / cron cancel) cần chuyển item -> CANCELLED để đồng bộ,
  //   nên cho phép staffUserId = null CHỈ với nextStatus=CANCELLED.
  // - forceSync=true: dùng cho flow đồng bộ theo ticket (RETURNED/CANCELLED) để tránh bị tự chặn.
  const staffId = toInt(staffUserId);
  const isSystemCancel = nextStatus === "CANCELLED" && !staffId;
  if (!staffId && !isSystemCancel) throw appError("Chưa đăng nhập", 401);

  const t = outerTransaction ?? (await sequelize.transaction());
  const shouldCommit = !outerTransaction;

  try {
    // Khoá item để tránh 2 staff thao tác cùng lúc
    const item = await BorrowItem.findByPk(id, {
      attributes: ["borrow_item_id", "ticket_id", "copy_id", "book_id", "status"],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!item) {
      if (shouldCommit) await t.commit();
      return null;
    }

    // Không làm gì nếu không đổi trạng thái
    if (item.status === nextStatus) {
      if (shouldCommit) await t.commit();
      return {
        data: {
          borrow_item_id: item.borrow_item_id,
          ticket_id: item.ticket_id,
          status: item.status,
        },
      };
    }

    // (Tuỳ chọn) Chặn sửa item khi ticket đã kết thúc
    // - Nếu là system cancel thì cần cho đi qua để đồng bộ
    const ticket = await BorrowTicket.findByPk(item.ticket_id, {
      attributes: ["ticket_id", "status"],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    // Cho phép update item khi ticket đang còn "active".
    // Chỉ chặn khi ticket đã kết thúc để tránh làm sai dữ liệu lịch sử.
    // NOTE: forceSync=true thì bỏ qua chặn này (đây là luồng đồng bộ theo ticket).
    if (!forceSync && !isSystemCancel && ticket) {
      const s = ticket.status;
      const isFinal = s === "RETURNED" || s === "CANCELLED";
      if (isFinal) {
        throw appError("Phiếu mượn đã kết thúc, không thể cập nhật borrow item", 400);
      }

      // Nghiệp vụ: chỉ khi ticket đang PICKED_UP thì mới cho phép staff cập nhật item.
      // (tránh staff sửa item khi phiếu chưa pickup hoặc đã được duyệt nhưng chưa giao).
      if (s !== "PICKED_UP") {
        throw appError("Chỉ được cập nhật borrow item khi phiếu mượn đang ở trạng thái PICKED_UP", 400);
      }
    }

    // Luật nghiệp vụ trạng thái borrow_item:
    // - Chỉ cho phép đi từ BORROWED -> (RETURNED | REMOVED | CANCELLED)
    // - Nếu đã là RETURNED/REMOVED/CANCELLED thì không được chuyển đi đâu nữa
    // - forceSync=true: dùng cho luồng đồng bộ theo ticket final status
    //   (ví dụ ticket RETURNED nhưng item còn BORROWED), vẫn cho phép chuyển để đồng bộ.
    if (!forceSync) {
      const from = item.status;
      const to = nextStatus;

      if (from !== "BORROWED" && from !== to) {
        throw appError(`Borrow item đã ở trạng thái ${from}, không thể chuyển sang ${to}`, 400);
      }

      if (from === "BORROWED" && to === "BORROWED") {
        // không đổi gì thì phía trên đã return rồi
      }
    }

    const patch = { status: nextStatus };

    // Chỉ set returned_at/by khi RETURNED (cần staff)
    if (nextStatus === "RETURNED") {
      patch.returned_at = new Date();
      patch.returned_by = staffId;
    }

    await item.update(patch, { transaction: t });

    // Đồng bộ book copy theo yêu cầu
    if (nextStatus === "RETURNED" || nextStatus === "CANCELLED") {
      await updateBookCopyService(item.copy_id, { status: "AVAILABLE" }, { transaction: t });
    } else if (nextStatus === "REMOVED") {
      await updateBookCopyService(item.copy_id, { status: "REMOVED" }, { transaction: t });
    }

    // Bonus: trả sách => cập nhật tổng lượt mượn book
    if (nextStatus === "RETURNED") {
      await recalcTotalBorrowCountForBook(item.book_id, { transaction: t });
    }

    // Yêu cầu 2b: nếu item chuyển RETURNED/REMOVED thì kiểm tra auto đổi ticket => RETURNED
    if (nextStatus === "RETURNED" || nextStatus === "REMOVED") {
      await ensureTicketReturnedIfAllItemsDone(item.ticket_id, { transaction: t });
    }

    if (shouldCommit) await t.commit();

    return {
      data: {
        borrow_item_id: item.borrow_item_id,
        ticket_id: item.ticket_id,
        status: item.status,
      },
    };
  } catch (e) {
    if (shouldCommit) await t.rollback();
    throw e;
  }
}
