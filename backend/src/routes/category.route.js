import { Router } from "express";
import { getAllCategories, getCategoryById, createCategory, updateCategory, deleteCategory } from "../controllers/category.controller.js";
import { requireAuthActive } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { createImageUpload } from "../middlewares/image.middleware.js";

const router = Router();
// Lấy tất cả các danh mục
router.get("/", getAllCategories);
// Lấy danh mục theo ID (nếu cần)
router.get("/:categoryId", getCategoryById);
// Tạo danh mục mới
router.post("/", ...requireAuthActive, requireRole("STAFF"), createImageUpload(), createCategory);
// Cập nhật danh mục
router.put("/:categoryId", ...requireAuthActive, requireRole("STAFF"), createImageUpload(), updateCategory);
// Xóa danh mục
router.delete("/:categoryId", ...requireAuthActive, requireRole("STAFF"), deleteCategory);

export default router;