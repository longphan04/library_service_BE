import { getRecentDashboardService } from "../services/dashboard/recent.service.js";
import { getBorrowReturnStatsService } from "../services/dashboard/circulation.service.js";
import { getTicketFlowStatsService } from "../services/dashboard/ticketFlow.service.js";

/**
 * GET /dashboard/recent
 * Lấy thông tin mới nhất cho dashboard:
 * - recent_book: sách mới thêm gần đây nhất
 * - recent_borrow_ticket: phiếu mượn PENDING mới nhất
 * - recent_return_ticket: phiếu trả sách mới nhất
 */
export async function getRecentDashboard(req, res, next) {
  try {
    const result = await getRecentDashboardService();
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

/**
 * GET /dashboard/borrow-return?period=week|month
 * Thống kê lượt mượn (PICKED_UP) và trả (RETURNED) theo ngày
 * - period=week: 7 ngày gần nhất (mặc định)
 * - period=month: 30 ngày gần nhất
 */
export async function getBorrowReturnStats(req, res, next) {
  try {
    const period = req.query.period === "month" ? "month" : "week";
    const result = await getBorrowReturnStatsService({ period });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

/**
 * GET /dashboard/ticket-flow?period=week|month
 * Thống kê luồng phiếu mượn (PENDING, APPROVED, CANCELLED) theo ngày
 * - period=week: 7 ngày gần nhất (mặc định)
 * - period=month: 30 ngày gần nhất
 */
export async function getTicketFlowStats(req, res, next) {
  try {
    const period = req.query.period === "month" ? "month" : "week";
    const result = await getTicketFlowStatsService({ period });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}
