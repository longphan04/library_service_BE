import { Op, fn, col, literal } from "sequelize";
import Book from "../../models/book.model.js";
import BorrowTicket from "../../models/borrowTicket.model.js";
import BorrowItem from "../../models/borrowItem.model.js";
import Profile from "../../models/profile.model.js";
import User from "../../models/user.model.js";

/**
 * Lấy 1 sách mới thêm gần đây nhất
 * - Sắp xếp theo created_at mới nhất
 * - Trả về: thời gian thêm, title, full_name người thêm
 */
async function getLatestBook() {
  const book = await Book.findOne({
    attributes: ["book_id", "title", "created_at", "created_by"],
    where: { status: "ACTIVE" },
    include: [
      {
        model: User,
        as: "creator",
        attributes: ["user_id"],
        required: false,
        include: [{ model: Profile, as: "profile", attributes: ["full_name"] }],
      },
    ],
    order: [["created_at", "DESC"]],
  });

  if (!book) return null;

  return {
    book_id: book.book_id,
    title: book.title,
    created_at: book.created_at,
    created_by_name: book.creator?.profile?.full_name ?? null,
  };
}

/**
 * Lấy 1 phiếu mượn PENDING mới nhất
 * - Sắp xếp theo thời gian tạo mới nhất
 * - Trả về: full_name người tạo, thời điểm tạo, số lượng item
 */
async function getLatestBorrowTicket() {
  const ticket = await BorrowTicket.findOne({
    attributes: ["ticket_id", "ticket_code", "member_id", "requested_at", "created_at"],
    where: { status: "PENDING" },
    include: [
      {
        model: User,
        as: "member",
        attributes: ["user_id"],
        required: false,
        include: [{ model: Profile, as: "profile", attributes: ["full_name"] }],
      },
      {
        model: BorrowItem,
        as: "items",
        attributes: ["borrow_item_id"],
      },
    ],
    order: [["created_at", "DESC"]],
  });

  if (!ticket) return null;

  return {
    ticket_id: ticket.ticket_id,
    ticket_code: ticket.ticket_code,
    member_name: ticket.member?.profile?.full_name ?? null,
    created_at: ticket.created_at,
    requested_at: ticket.requested_at,
    item_count: ticket.items?.length ?? 0,
  };
}

/**
 * Lấy 1 phiếu mượn RETURNED mới nhất
 * - Sắp xếp theo thời điểm trả (updated_at)
 * - Trả về: full_name chủ phiếu, thời điểm trả, số lượng item
 */
async function getLatestReturnTicket() {
  const ticket = await BorrowTicket.findOne({
    attributes: ["ticket_id", "ticket_code", "member_id", "updated_at"],
    where: { status: "RETURNED" },
    include: [
      {
        model: User,
        as: "member",
        attributes: ["user_id"],
        required: false,
        include: [{ model: Profile, as: "profile", attributes: ["full_name"] }],
      },
      {
        model: BorrowItem,
        as: "items",
        attributes: ["borrow_item_id"],
      },
    ],
    order: [["updated_at", "DESC"]],
  });

  if (!ticket) return null;

  return {
    ticket_id: ticket.ticket_id,
    ticket_code: ticket.ticket_code,
    member_name: ticket.member?.profile?.full_name ?? null,
    returned_at: ticket.updated_at,
    item_count: ticket.items?.length ?? 0,
  };
}

/**
 * API: GET /dashboard/recent
 * Gộp 3 thông tin mới nhất vào 1 API:
 * - recent_book: sách mới thêm gần đây nhất
 * - recent_borrow_ticket: phiếu mượn PENDING mới nhất  
 * - recent_return_ticket: phiếu trả sách mới nhất
 *
 * Chạy song song 3 query để tối ưu hiệu năng
 */
export async function getRecentDashboardService() {
  // Chạy song song 3 query để tối ưu tốc độ
  const [recentBook, recentBorrowTicket, recentReturnTicket] = await Promise.all([
    getLatestBook(),
    getLatestBorrowTicket(),
    getLatestReturnTicket(),
  ]);

  return {
    data: {
      recent_book: recentBook,
      recent_borrow_ticket: recentBorrowTicket,
      recent_return_ticket: recentReturnTicket,
    },
  };
}
