import Category from "../models/category.model.js";
import { saveUploadedImage, deletePublicImage } from "../middlewares/image.middleware.js";
import { appError } from "../utils/appError.js";

// Lấy tất cả danh mục
export const getAllCategories = async () => {
  const categories = await Category.findAll({ 
    order: [["name", "ASC"]]
  });
  return categories;
};

// Lấy danh mục theo ID
export const getCategoryById = async (categoryId) => {
  const category = await Category.findByPk(categoryId);
  return category;
};

// Tạo danh mục mới
export const createCategory = async ({ name, imageFile }) => {
  // Validate
  if (!name || name.trim() === "") {
    throw appError("Tên danh mục là bắt buộc", 400);
  }
  const trimmedName = name.trim();

  // Kiểm tra trùng tên TRƯỚC KHI upload ảnh
  const existingCategory = await Category.findOne({ 
    where: { name: trimmedName } 
  });
  
  if (existingCategory) {
    throw appError("Tên danh mục đã tồn tại", 400);
  }

  let imagePath = null;
  
  // Xử lý ảnh nếu có file upload
  if (imageFile) {
    imagePath = await saveUploadedImage({ 
      file: imageFile, 
      type: "category" 
    });
  }

  try {
    const category = await Category.create({
      name: name.trim(),
      image: imagePath  // Lưu đường dẫn tương đối: "category/uuid.jpg"
    });

    return category;
  } catch (err) {
    // Rollback: xóa ảnh nếu tạo category thất bại
    if (imagePath) {
      await deletePublicImage(imagePath);
    }
    throw err;
  }
};

// Cập nhật danh mục
export const updateCategory = async (categoryId, { name, imageFile }) => {
  const category = await Category.findByPk(categoryId);
  if (!category) return null;
  // Validate tên nếu có
  if (name && name.trim() === "") {
    throw appError("Tên danh mục không được để trống", 400);
  }
  // Kiểm tra trùng tên nếu có thay đổi tên
  if (name && name.trim() !== category.name) {
    const existingCategory = await Category.findOne({
      where: { name: name.trim() }
    });

    if (existingCategory) {
      throw appError("Tên danh mục đã tồn tại", 400);
    }
  }

  const oldImage = category.image;  // Đường dẫn tương đối cũ
  let newImage = null;

  try {
    // Xử lý ảnh mới nếu có
    if (imageFile) {
      newImage = await saveUploadedImage({ 
        file: imageFile, 
        type: "category" 
      });
    }

    // Cập nhật category
    await category.update({
      name: name ? name.trim() : category.name,
      image: newImage || category.image
    });

    // Xóa ảnh cũ nếu có ảnh mới
    if (newImage && oldImage) {
      await deletePublicImage(oldImage);
    }

    return category;
  } catch (err) {
    // Rollback: xóa ảnh mới nếu update thất bại
    if (newImage) {
      await deletePublicImage(newImage);
    }
    throw err;
  }
};

// Xóa danh mục
export const deleteCategory = async (categoryId) => {
  const category = await Category.findByPk(categoryId);
  if (!category) return false;
  // kiểm tra danh mục này có xóa được không
  const hasBooks = await category.countBooks();
  if (hasBooks) {
    throw appError("Không thể xóa danh mục vì có sách đang sử dụng", 400);
  }
  const imagePath = category.image;
  
  try {
    await category.destroy();
    
    // Xóa ảnh nếu có
    if (imagePath) {
      await deletePublicImage(imagePath);
    }
    
    return true;
  } catch (err) {
    if (imagePath) {
      await deletePublicImage(imagePath);
    }
    throw err;
  }
};