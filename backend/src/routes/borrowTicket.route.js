import express from "express";
import { requireAuthActive } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
  getAllBorrowTickets,
  getMyBorrowTickets,
  getBorrowTicketsByUserId,
  createBorrowTicket,
  getBorrowTicketById,
  updateBorrowTicketForMember,
  updateBorrowTicketForStaff,
} from "../controllers/borrowTicket.controller.js";

const router = express.Router();

// STAFF: xem tất cả phiếu mượn
router.get("/", ...requireAuthActive, requireRole("STAFF"), getAllBorrowTickets);

// MEMBER: xem phiếu mượn của mình
router.get("/me", ...requireAuthActive, requireRole("MEMBER"), getMyBorrowTickets);

// STAFF: xem phiếu mượn của một user cụ thể (đặt trước /:id để tránh conflict)
router.get("/user/:userId", ...requireAuthActive, requireRole("STAFF"), getBorrowTicketsByUserId);

// MEMBER: hủy / gia hạn
router.put("/:id/member", ...requireAuthActive, requireRole("MEMBER"), updateBorrowTicketForMember);

// STAFF: cập nhật trạng thái theo flow
router.put("/:id/staff", ...requireAuthActive, requireRole("STAFF"), updateBorrowTicketForStaff);

// Xem chi tiết (STAFF hoặc MEMBER). Service sẽ tự check ownership.
router.get("/:id", ...requireAuthActive, requireRole("STAFF", "MEMBER"), getBorrowTicketById);

// MEMBER: tạo phiếu mượn
router.post("/", ...requireAuthActive, requireRole("MEMBER"), createBorrowTicket);

export default router;
