import express from "express";
import { requireAuthActive } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { createImageUpload } from "../middlewares/image.middleware.js";
import { getAllBooks, getBookById, createBook, updateBook, deleteBook, suggestBooks } from "../controllers/book.controller.js";

const router = express.Router();

// Gợi ý sách (autocomplete)
router.get("/suggest", suggestBooks);

// Lấy tất cả các sách
router.get("/", getAllBooks);
// Lấy sách theo ID
router.get("/:id", getBookById);
// Tạo sách mới
router.post("/", ...requireAuthActive, requireRole("STAFF"), createImageUpload(), createBook);
// Cập nhật sách
router.put("/:id", ...requireAuthActive, requireRole("STAFF"), createImageUpload(), updateBook);
// Xóa sách
router.delete("/:id", ...requireAuthActive, requireRole("STAFF"), deleteBook);


export default router;