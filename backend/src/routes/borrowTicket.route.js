import express from "express";
import { requireAuthActive } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
  getAllBorrowTickets,
  getMyBorrowTickets,
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

// MEMBER: hủy / gia hạn
router.put("/:id/member", ...requireAuthActive, requireRole("MEMBER"), updateBorrowTicketForMember);

// STAFF: cập nhật trạng thái theo flow
router.put("/:id/staff", ...requireAuthActive, requireRole("STAFF"), updateBorrowTicketForStaff);

// Xem chi tiết (STAFF hoặc MEMBER). Service sẽ tự check ownership.
router.get("/:id", ...requireAuthActive, requireRole("STAFF", "MEMBER"), getBorrowTicketById);

// MEMBER: tạo phiếu mượn
router.post("/", ...requireAuthActive, requireRole("MEMBER"), createBorrowTicket);

export default router;
