import express from "express";
import { requireAuthActive } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
  getRecentDashboard,
  getBorrowReturnStats,
  getTicketFlowStats,
} from "../controllers/dashboard.controller.js";

const router = express.Router();

// GET /dashboard/recent - Lấy thông tin mới nhất (sách, phiếu mượn, phiếu trả)
router.get("/recent", ...requireAuthActive, requireRole("STAFF", "ADMIN"), getRecentDashboard);

// GET /dashboard/borrow-return?period=week|month - Thống kê lượt mượn/trả theo ngày (biểu đồ đường)
router.get("/borrow-return", ...requireAuthActive, requireRole("ADMIN"), getBorrowReturnStats);

// GET /dashboard/ticket-flow?period=week|month - Thống kê luồng phiếu (PENDING/APPROVED/CANCELLED) theo ngày
router.get("/ticket-flow", ...requireAuthActive, requireRole("ADMIN"), getTicketFlowStats);

export default router;
