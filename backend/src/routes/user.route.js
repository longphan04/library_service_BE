import express from "express";
import { requireAuthActive } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
  getAllMembers,
  getAllStaffs,
  updateUserStatus,
  deleteUser,
} from "../controllers/user.controller.js";

const router = express.Router();
// xem tất cả member
router.get("/member", ...requireAuthActive, requireRole("STAFF"), getAllMembers);
// xem tất cả staff
router.get("/staff", ...requireAuthActive, requireRole("ADMIN"), getAllStaffs);
// chỉnh sửa trạng thái người dùng (active/inactive)
router.patch("/:userId", ...requireAuthActive, requireRole("STAFF"), updateUserStatus);
// xóa người dùng
router.delete("/:userId", ...requireAuthActive, requireRole("ADMIN"), deleteUser);

export default router;
