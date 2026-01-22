import BorrowTicket from "../../models/borrowTicket.model.js";
import BorrowItem from "../../models/borrowItem.model.js";
import BookCopy from "../../models/bookCopy.model.js";
import Book from "../../models/book.model.js";
import { appError } from "../../utils/appError.js";

// tiếng việt
// hợp lệ trạng thái mượn
const ALLOWED_STATUS = ["PENDING", "APPROVED", "PICKED_UP", "RETURNED", "CANCELLED"];
// phân trang an toàn
function parsePaging({ page = 1, limit = 18 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 18, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  return { safeLimit, safePage, offset: (safePage - 1) * safeLimit };
}
// chuẩn hoá bộ lọc trạng thái
function normalizeStatusFilter(status) {
  if (status === undefined || status === null || status === "") return null;
  const s = String(status).trim().toUpperCase();
  if (!ALLOWED_STATUS.includes(s)) throw appError("status không hợp lệ", 400);
  return s;
}
// chuyển hàng thành DTO cho danh sách
// có ticket_id 
function computeOverdue(status, dueDate) {
  if (status !== "PICKED_UP" || !dueDate) return { is_overdue: false, overdue_days: 0 };
  const due = new Date(dueDate);
  const now = new Date();
  if (!(due < now)) return { is_overdue: false, overdue_days: 0 };
  const days = Math.ceil((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
  return { is_overdue: true, overdue_days: Math.max(days, 1) };
}
function toTicketListDto(row) {
  const r = row?.toJSON ? row.toJSON() : row;
  const overdue = computeOverdue(r.status, r.due_date);
  return {
    ticket_id: r.ticket_id,
    ticket_code: r.ticket_code,
    status: r.status,
    requested_at: r.requested_at,
    approved_at: r.approved_at,
    pickup_expires_at: r.pickup_expires_at,
    picked_up_at: r.picked_up_at,
    due_date: r.due_date,
    renew_count: r.renew_count,
    ...overdue,
  };
}
// chuyển hàng thành DTO chi tiết
function toTicketBaseDto(ticket) {
  const t = ticket?.toJSON ? ticket.toJSON() : ticket;
  return {
    ticket_id: t.ticket_id,
    ticket_code: t.ticket_code,
    status: t.status,
    requested_at: t.requested_at,
    approved_at: t.approved_at,
    pickup_expires_at: t.pickup_expires_at,
    picked_up_at: t.picked_up_at,
    due_date: t.due_date,
    renew_count: t.renew_count,
  };
}
// chuyển hàng thành DTO chi tiết có items
function toTicketDetailDto(ticketRow) {
  const t = ticketRow?.toJSON ? ticketRow.toJSON() : ticketRow;

  const base = toTicketBaseDto(t);

  const items = (t.items || []).map((it) => ({
    status: it.status,
    copy: {
      id: it.copy?.copy_id ?? it.copy_id,
      note: it.copy?.note ?? null,
    },
    book: {
      book_id: it.book?.book_id ?? it.book_id,
      title: it.book?.title ?? null,
      cover_url: it.book?.cover_url ?? null,
    },
  }));

  return { ...base, items };
}
// include items cho detail
function includeItemsForDetail() {
  return [
    {
      model: BorrowItem,
      as: "items",
      attributes: ["borrow_item_id", "status", "copy_id", "book_id"],
      required: false,
      include: [
        {
          model: BookCopy,
          as: "copy",
          attributes: ["copy_id", "note"],
          required: true,
        },
        {
          model: Book,
          as: "book",
          attributes: ["book_id", "title", "cover_url"],
          required: true,
        },
      ],
    },
  ];
}

// STAFF: GET /borrow-ticket
export async function getAllBorrowTicketsService({ status, page, limit } = {}) {
  const { safeLimit, safePage, offset } = parsePaging({ page, limit });
  const s = normalizeStatusFilter(status);

  const where = s ? { status: s } : {};

  const { count, rows } = await BorrowTicket.findAndCountAll({
    where,
    attributes: [
      "ticket_id",
      "ticket_code",
      "status",
      "requested_at",
      "approved_at",
      "pickup_expires_at",
      "picked_up_at",
      "due_date",
      "renew_count",
    ],
    order: [["ticket_id", "DESC"]],
    limit: safeLimit,
    offset,
  });

  return {
    data: rows.map(toTicketListDto),
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalItems: count,
      totalPages: Math.ceil(count / safeLimit) || 1,
      hasNext: offset + rows.length < count,
    },
  };
}

// MEMBER: GET /borrow-ticket/me
export async function getMyBorrowTicketsService(memberId, { status, page, limit } = {}) {
  const id = Number(memberId);
  if (!Number.isFinite(id)) throw appError("memberId không hợp lệ", 400);

  const { safeLimit, safePage, offset } = parsePaging({ page, limit });
  const s = normalizeStatusFilter(status);

  const where = {
    member_id: id,
    ...(s ? { status: s } : {}),
  };

  const { count, rows } = await BorrowTicket.findAndCountAll({
    where,
    attributes: [
      "ticket_id",
      "ticket_code",
      "status",
      "requested_at",
      "approved_at",
      "pickup_expires_at",
      "picked_up_at",
      "due_date",
      "renew_count",
    ],
    order: [["ticket_id", "DESC"]],
    limit: safeLimit,
    offset,
  });

  return {
    data: rows.map(toTicketListDto),
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalItems: count,
      totalPages: Math.ceil(count / safeLimit) || 1,
      hasNext: offset + rows.length < count,
    },
  };
}

// GET /borrow-ticket/:id
// - STAFF: xem được tất cả
// - MEMBER: chỉ xem ticket của chính mình
export async function getBorrowTicketByIdService({ ticketId, requesterUserId, requesterRoles = [] } = {}) {
  const id = Number(ticketId);
  if (!Number.isFinite(id)) throw appError("ticketId không hợp lệ", 400);

  const userId = Number(requesterUserId);
  if (!Number.isFinite(userId)) throw appError("Chưa đăng nhập", 401);

  const roles = Array.isArray(requesterRoles) ? requesterRoles : [];
  const isStaff = roles.includes("STAFF") || roles.includes("ADMIN");
  const isMember = roles.includes("MEMBER");

  if (!isStaff && !isMember) throw appError("Không đủ quyền", 403);

  const where = isStaff ? { ticket_id: id } : { ticket_id: id, member_id: userId };

  const ticket = await BorrowTicket.findOne({
    where,
    attributes: [
      "ticket_id",
      "ticket_code",
      "member_id",
      "status",
      "requested_at",
      "approved_at",
      "pickup_expires_at",
      "picked_up_at",
      "due_date",
      "renew_count",
    ],
    include: includeItemsForDetail(),
  });

  if (!ticket) return null;

  return {
    data: toTicketDetailDto(ticket),
  };
}