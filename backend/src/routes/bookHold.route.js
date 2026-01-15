import express from "express";
import { requireAuthActive } from "../middlewares/auth.middleware.js";
import { getMyBookHolds, createBookHold, deleteBookHolds } from "../controllers/bookHold.controller.js";

const router = express.Router();

// Lấy tất cả bookHold của người dùng
router.get("/me", ...requireAuthActive, getMyBookHolds);

// Tạo mới bookHold (giữ 1 bản sao AVAILABLE)
router.post("/", ...requireAuthActive, createBookHold);

// Xóa 1 hoặc nhiều hold (release copy nếu đang HELD)
router.delete("/", ...requireAuthActive, deleteBookHolds);

export default router;