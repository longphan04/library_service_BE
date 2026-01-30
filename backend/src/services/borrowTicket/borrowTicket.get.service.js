import BorrowTicket from "../../models/borrowTicket.model.js";
import BorrowItem from "../../models/borrowItem.model.js";
import BookCopy from "../../models/bookCopy.model.js";
import Book from "../../models/book.model.js";
import Author from "../../models/author.model.js";
import Publisher from "../../models/publisher.model.js";
import { appError } from "../../utils/appError.js";
import User from "../../models/user.model.js";
import Profile from "../../models/profile.model.js";
import { Op } from "sequelize";

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
    returned_at: r.returned_at,
    cancelled_at: r.cancelled_at,
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
    returned_at: t.returned_at,
    cancelled_at: t.cancelled_at,
    renew_count: t.renew_count,
  };
}
// chuyển hàng thành DTO chi tiết có items
function toTicketDetailDto(ticketRow) {
  const t = ticketRow?.toJSON ? ticketRow.toJSON() : ticketRow;

  const base = toTicketBaseDto(t);

  const memberUser = t.member || null;
  const memberProfile = memberUser?.profile || null;

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
      publisher: it.book?.publisher
        ? {
            publisher_id: it.book.publisher.publisher_id ?? null,
            name: it.book.publisher.name ?? null,
          }
        : null,
      authors: Array.isArray(it.book?.authors)
        ? it.book.authors.map((a) => ({
            author_id: a.author_id ?? null,
            name: a.name ?? null,
          }))
        : [],
    },
  }));

  return {
    ...base,
    member: memberUser
      ? {
          member_id: memberUser.user_id ?? t.member_id ?? null,
          email: memberUser.email ?? null,
          full_name: memberProfile?.full_name ?? null,
        }
      : {
          member_id: t.member_id ?? null,
          email: null,
          full_name: null,
        },
    items,
  };
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
          include: [
            {
              model: Publisher,
              as: "publisher",
              attributes: ["publisher_id", "name"],
              required: false,
            },
            {
              model: Author,
              as: "authors",
              attributes: ["author_id", "name"],
              through: { attributes: [] },
              required: false,
            },
          ],
        },
      ],
    },
  ];
}

// STAFF: GET /borrow-ticket
// có thể lọc trạng thái
// có thể tìm kiếm phiếu mượn theo tên full_name của member
export async function getAllBorrowTicketsService({ status, q, page, limit } = {}) {
  const { safeLimit, safePage, offset } = parsePaging({ page, limit });
  const s = normalizeStatusFilter(status);

  const where = s ? { status: s } : {};

  // Xử lý tìm kiếm theo tên member
  let includeConditions = [
    {
      model: User,
      as: "member",
      attributes: ["user_id", "email"],
      required: true,
      include: [
        {
          model: Profile,
          as: "profile",
          attributes: ["full_name"],
          required: false,
        },
      ],
    },
  ];

  // Nếu có query tìm kiếm theo tên
  const searchQuery = String(q ?? "").trim();
  if (searchQuery) {
    includeConditions[0].include[0].where = {
      full_name: { [Op.like]: `%${searchQuery}%` }
    };
    includeConditions[0].include[0].required = true;
  }

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
      "returned_at",
      "cancelled_at",
      "renew_count",
    ],
    include: includeConditions,
    order: [["ticket_id", "DESC"]],
    limit: safeLimit,
    offset,
    distinct: true, // Đảm bảo count chính xác khi có join
  });

  return {
    data: rows.map((row) => {
      const ticket = toTicketListDto(row);
      const member = row.member || {};
      const profile = member.profile || {};
      return {
        ...ticket,
        user: {
          member_id: member.user_id,
          email: member.email,
          full_name: profile.full_name,
        },
      };
    }),
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
      "returned_at",
      "cancelled_at",
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

// STAFF: GET /borrow-ticket/user/:userId
// Cho phép STAFF xem phiếu mượn của một user cụ thể (giống getMyBorrowTicketsService nhưng dành cho staff)
export async function getBorrowTicketsByUserIdService(userId, { status, page, limit } = {}) {
  const id = Number(userId);
  if (!Number.isFinite(id)) throw appError("userId không hợp lệ", 400);

  const { safeLimit, safePage, offset } = parsePaging({ page, limit });
  const s = normalizeStatusFilter(status);

  const where = {
    member_id: id,
    ...(s ? { status: s } : {}),
  };

  // Include thông tin user để trả về cùng kết quả
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
      "returned_at",
      "cancelled_at",
      "renew_count",
    ],
    include: [
      {
        model: User,
        as: "member",
        attributes: ["user_id", "email"],
        required: true,
        include: [
          {
            model: Profile,
            as: "profile",
            attributes: ["full_name"],
            required: false,
          },
        ],
      },
    ],
    order: [["ticket_id", "DESC"]],
    limit: safeLimit,
    offset,
    distinct: true,
  });

  // Lấy thông tin user từ row đầu tiên (nếu có)
  const memberInfo = rows.length > 0
    ? {
        member_id: rows[0].member?.user_id ?? id,
        email: rows[0].member?.email ?? null,
        full_name: rows[0].member?.profile?.full_name ?? null,
      }
    : null;

  return {
    user: memberInfo,
    data: rows.map((row) => {
      const ticket = toTicketListDto(row);
      return ticket;
    }),
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
      "returned_at",
      "cancelled_at",
      "renew_count",
    ],
    include: [
      {
        model: User,
        as: "member",
        attributes: ["user_id", "email"],
        required: true,
        include: [
          {
            model: Profile,
            as: "profile",
            attributes: ["full_name"],
            required: false,
          },
        ],
      },
      ...includeItemsForDetail(),
    ],
  });

  if (!ticket) return null;

  return {
    data: toTicketDetailDto(ticket),
  };
}