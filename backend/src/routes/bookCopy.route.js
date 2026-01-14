import express from "express";
import { requireAuthActive } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { createImageUpload } from "../middlewares/image.middleware.js";
import { getAllBookCopy, getBookCopyById, createBookCopy, updateBookCopy, deleteBookCopy } from "../controllers/bookCopy.controller.js";

const router = express.Router();


// Lấy tất cả các bản sao sách theo id sách
router.get("/book/:bookId", getAllBookCopy);
// Lấy bản sao sách theo ID
router.get("/:id", getBookCopyById);
// Tạo bản sao sách mới
router.post("/", ...requireAuthActive, requireRole("STAFF"), createImageUpload(), createBookCopy);
// // Cập nhật bản sao sách
// router.put("/:id", ...requireAuthActive, requireRole("STAFF"), createImageUpload(), updateBookCopy);
// Xóa bản sao sách
router.delete("/:id", ...requireAuthActive, requireRole("STAFF"), deleteBookCopy);


export default router;