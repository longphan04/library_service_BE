import sequelize from "../../config/dbConnection.js";
import { Op } from "sequelize";

import BorrowTicket from "../../models/borrowTicket.model.js";
import BorrowItem from "../../models/borrowItem.model.js";

import { appError } from "../../utils/appError.js";
import { syncBorrowItemsWithTicketFinalStatus } from "../borrowItem/borrow-state.service.js";
import {
  notifyMemberApproved,
  notifyMemberPickedUp,
  notifyMemberReturned,
  notifyMemberCancelled,
} from "../notification/notification.service.js";

// =========================
// Helper chung
// =========================

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeStatus(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value).trim().toUpperCase();
}

function addDays(date, days) {
  return new Date(date.getTime() + Number(days) * 24 * 60 * 60 * 1000);
}

function pickRequiredAction(payload = {}) {
  // API member dùng 1 endpoint cho 2 hành động:
  // - cancel: chuyển status -> CANCELLED
  // - renew: gia hạn due_date + tăng renew_count
  const action = String(payload.action ?? "").trim().toLowerCase();
  if (action) return action;

  // fallback: client chỉ gửi status=CANCELLED
  const st = normalizeStatus(payload.status);
  if (st === "CANCELLED") return "cancel";

  // fallback: client gửi renew=true
  if (payload.renew === true || payload.isRenew === true) return "renew";

  return null;
}

// Bảng chuyển trạng thái hợp lệ cho STAFF
const STAFF_ALLOWED_TRANSITIONS = Object.freeze({
  PENDING: ["APPROVED", "CANCELLED"],
  APPROVED: ["PICKED_UP"],
  PICKED_UP: ["RETURNED"],
  RETURNED: [],
  CANCELLED: [],
});

function assertStaffTransition(from, to) {
  const allowed = STAFF_ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw appError(`Không thể chuyển trạng thái từ ${from} sang ${to}`, 400);
  }
}

// =========================
// MEMBER: PUT /borrow-ticket/:id/member
// - cancel: chỉ khi PENDING
// - renew: chỉ khi PICKED_UP, renew_count=0, và chưa quá hạn due_date
// =========================

export async function updateBorrowTicketForMemberService(
  ticketId,
  memberId,
  payload = {}
) {
  const id = toInt(ticketId);
  if (!id) throw appError("ticketId không hợp lệ", 400);

  const uid = toInt(memberId);
  if (!uid) throw appError("Chưa đăng nhập", 401);

  const action = pickRequiredAction(payload);
  if (!action) throw appError("Thiếu action (cancel|renew)", 400);

  if (action === "cancel") {
    // Member cancel: dùng transaction để đảm bảo ticket và items đồng bộ
    return await sequelize.transaction(async (t) => {
      const [affected] = await BorrowTicket.update(
        { status: "CANCELLED", cancelled_at: new Date() },
        {
          where: {
            ticket_id: id,
            member_id: uid,
            status: "PENDING",
          },
          transaction: t,
        }
      );

      if (!affected) {
        // phân biệt case không tồn tại vs sai trạng thái
        const exists = await BorrowTicket.findOne({
          where: { ticket_id: id, member_id: uid },
          attributes: ["ticket_id", "status"],
          transaction: t,
          lock: t.LOCK.SHARE,
        });
        if (!exists) return null;
        throw appError("Chỉ được hủy khi phiếu đang ở trạng thái PENDING", 400);
      }

      // Đồng bộ items + book_copy theo final status của ticket
      // (member cancel không có staffUserId)
      await syncBorrowItemsWithTicketFinalStatus(id, { transaction: t, staffUserId: null });

      return { data: { ticket_id: id, status: "CANCELLED" } };
    });
  }

  if (action === "renew") {
    const now = new Date();

    // Với renew cần đọc due_date để +10 ngày nên phải SELECT (nhưng chỉ lấy field tối thiểu)
    const ticket = await BorrowTicket.findOne({
      where: { ticket_id: id, member_id: uid },
      attributes: ["ticket_id", "status", "due_date", "renew_count"],
    });

    if (!ticket) return null;

    if (ticket.status !== "PICKED_UP") {
      throw appError("Chỉ được gia hạn khi phiếu đang ở trạng thái PICKED_UP", 400);
    }

    if (!ticket.due_date) {
      throw appError("Phiếu mượn chưa có due_date", 400);
    }

    if (Number(ticket.renew_count) >= 1) {
      throw appError("Bạn chỉ được gia hạn tối đa 1 lần", 400);
    }

    if (new Date(ticket.due_date).getTime() < now.getTime()) {
      throw appError("Đã quá hạn, không thể gia hạn", 400);
    }

    const newDue = addDays(new Date(ticket.due_date), 10);

    // Đảm bảo không race: update có điều kiện renew_count=0
    const [affected] = await BorrowTicket.update(
      { due_date: newDue, renew_count: 1 },
      {
        where: {
          ticket_id: id,
          member_id: uid,
          status: "PICKED_UP",
          renew_count: 0,
          due_date: { [Op.gte]: now },
        },
      }
    );

    if (!affected) {
      // Nếu bị race hoặc do dữ liệu thay đổi đúng lúc
      throw appError("Không thể gia hạn (trạng thái không hợp lệ hoặc đã gia hạn)", 400);
    }

    return {
      data: {
        ticket_id: id,
        status: "PICKED_UP",
        due_date: newDue,
        renew_count: 1,
      },
    };
  }

  throw appError("action không hợp lệ (cancel|renew)", 400);
}

// =========================
// STAFF: PUT /borrow-ticket/:id/staff
// - PENDING -> APPROVED/CANCELLED
// - APPROVED -> PICKED_UP
// - PICKED_UP -> RETURNED
// =========================

export async function updateBorrowTicketForStaffService(
  ticketId,
  staffUserId,
  payload = {}
) {
  const id = toInt(ticketId);
  if (!id) throw appError("ticketId không hợp lệ", 400);

  const staffId = toInt(staffUserId);
  if (!staffId) throw appError("Chưa đăng nhập", 401);

  const nextStatus = normalizeStatus(payload.status);
  if (!nextStatus) throw appError("Thiếu status", 400);

  if (!Object.prototype.hasOwnProperty.call(STAFF_ALLOWED_TRANSITIONS, nextStatus)) {
    throw appError("status không hợp lệ", 400);
  }

  return await sequelize.transaction(async (t) => {
    // Khóa ticket để đảm bảo chuyển trạng thái nhất quán
    const ticket = await BorrowTicket.findByPk(id, {
      attributes: [
        "ticket_id",
        "ticket_code",
        "member_id",
        "status",
        "approved_at",
        "pickup_expires_at",
        "picked_up_at",
        "due_date",
      ],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!ticket) return null;

    const current = ticket.status;
    assertStaffTransition(current, nextStatus);

    // Payload update tối thiểu theo từng bước
    const patch = { status: nextStatus };

    if (current === "PENDING" && nextStatus === "APPROVED") {
      // staff duyệt: set approved_at/by và hạn pickup 2 ngày
      const now = new Date();
      patch.approved_at = now;
      patch.approved_by = staffId;
      patch.pickup_expires_at = addDays(now, 2);
    }

    if (current === "PENDING" && nextStatus === "CANCELLED") {
      // Hủy từ PENDING: set thời điểm hủy
      patch.cancelled_at = new Date();
    }

    if (current === "APPROVED" && nextStatus === "PICKED_UP") {
      const now = new Date();
      patch.picked_up_at = now;
      patch.picked_up_by = staffId;
      patch.due_date = addDays(now, 10);
    }

    if (current === "PICKED_UP" && nextStatus === "RETURNED") {
      // Set thời điểm trả sách
      patch.returned_at = new Date();
    }

    await ticket.update(patch, { transaction: t });

    // Yêu cầu 2a: nếu ticket đã kết thúc (RETURNED/CANCELLED) => đồng bộ item + book_copy
    if (ticket.status === "RETURNED" || ticket.status === "CANCELLED") {
      await syncBorrowItemsWithTicketFinalStatus(ticket.ticket_id, {
        transaction: t,
        staffUserId: staffId,
      });
    }

    // Gửi thông báo cho member theo trạng thái mới
    // (gọi ngoài transaction để không ảnh hưởng logic chính)
    const ticketData = {
      ticket_id: ticket.ticket_id,
      ticket_code: ticket.ticket_code,
      member_id: ticket.member_id,
      pickup_expires_at: ticket.pickup_expires_at,
      due_date: ticket.due_date,
    };

    if (nextStatus === "APPROVED") {
      setImmediate(() => notifyMemberApproved(ticketData));
    } else if (nextStatus === "PICKED_UP") {
      setImmediate(() => notifyMemberPickedUp(ticketData));
    } else if (nextStatus === "RETURNED") {
      setImmediate(() => notifyMemberReturned(ticketData));
    } else if (nextStatus === "CANCELLED") {
      setImmediate(() => notifyMemberCancelled(ticketData, "Staff đã hủy phiếu"));
    }

    return {
      data: {
        ticket_id: ticket.ticket_id,
        status: ticket.status,
        approved_at: ticket.approved_at,
        pickup_expires_at: ticket.pickup_expires_at,
        picked_up_at: ticket.picked_up_at,
        due_date: ticket.due_date,
      },
    };
  });
}
