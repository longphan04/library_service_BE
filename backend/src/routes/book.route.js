import express from "express";
import { requireAuthActive, optionalAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { createImageUpload } from "../middlewares/image.middleware.js";
import { getAllBooks, getBookById, getBookByIdentifier, createBook, updateBook, deleteBook, suggestBooks, getRecommendations } from "../controllers/book.controller.js";

const router = express.Router();

// Gợi ý sách (autocomplete)
router.get("/suggest", suggestBooks);

// Gợi ý sách dựa trên lịch sử xem (cần đăng nhập)
router.get("/recommendation", ...requireAuthActive, getRecommendations);

// Lấy tất cả các sách
router.get("/", getAllBooks);
// Lấy sách theo mã Identifier (phải đặt trước /:id để tránh conflict)
router.get("/identifier/:identifier", getBookByIdentifier);
// Lấy sách theo ID (optionally ghi log view nếu đã đăng nhập)
router.get("/:id", optionalAuth, getBookById);
// Tạo sách mới
router.post("/", ...requireAuthActive, requireRole("STAFF"), createImageUpload(), createBook);
// Cập nhật sách
router.put("/:id", ...requireAuthActive, requireRole("STAFF"), createImageUpload(), updateBook);
// Xóa sách
router.delete("/:id", ...requireAuthActive, requireRole("STAFF"), deleteBook);


export default router;