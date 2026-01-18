import express from "express";
import { requireAuthActive } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { updateBorrowItemStatus } from "../controllers/borrowItem.controller.js";


const router = express.Router();

// STAFF: sửa thông tin borrow item (trả, hủy, removed...)
router.put("/:id", ...requireAuthActive, requireRole("STAFF"), updateBorrowItemStatus);

export default router;