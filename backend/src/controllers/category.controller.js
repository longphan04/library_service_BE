import * as categoryService from "../services/category.service.js";

// Lấy tất cả danh mục
export const getAllCategories = async (req, res, next) => {
  try {
    const categories = await categoryService.getAllCategories();
    res.json(categories);
  } catch (err) {
    next(err);
  }
};

// Lấy danh mục theo ID
export const getCategoryById = async (req, res, next) => {
  try {
    const category = await categoryService.getCategoryById(req.params.categoryId);
    if (!category) return res.status(404).json({ message: "Không tìm thấy danh mục" });
    res.json(category);
  } catch (err) {
    next(err);
  }
};

// Tạo danh mục mới
export const createCategory = async (req, res, next) => {
  try {
    const result = await categoryService.createCategory({
      name: req.body.name,
      imageFile: req.file,  // Gửi req.file thay vì req.body.image
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

// Cập nhật danh mục
export const updateCategory = async (req, res, next) => {
  try {
    const result = await categoryService.updateCategory(
      req.params.categoryId,
      {
        name: req.body.name,
        imageFile: req.file,  // Gửi req.file thay vì req.body.image
      }
    );
    if (!result) return res.status(404).json({ message: "Không tìm thấy danh mục" });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// Xóa danh mục
export const deleteCategory = async (req, res, next) => {
  try {
    const ok = await categoryService.deleteCategory(req.params.categoryId);
    if (!ok) return res.status(404).json({ message: "Không tìm thấy danh mục" });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};