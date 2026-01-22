import express from "express";
import { requireAuthActive } from "../middlewares/auth.middleware.js";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "../controllers/notification.controller.js";

const router = express.Router();

// Lấy danh sách thông báo của user hiện tại
router.get("/", ...requireAuthActive, getNotifications);

// Đếm số thông báo chưa đọc
router.get("/unread-count", ...requireAuthActive, getUnreadCount);

// Đánh dấu TẤT CẢ thông báo đã đọc
router.put("/read-all", ...requireAuthActive, markAllAsRead);

// Đánh dấu 1 thông báo đã đọc
router.put("/:id/read", ...requireAuthActive, markAsRead);

export default router;
