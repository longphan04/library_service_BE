import Category from "../../models/category.model.js";
import { saveUploadedImage, deletePublicImage } from "../../middlewares/image.middleware.js";
import { appError } from "../../utils/appError.js";
import Book from "../../models/book.model.js";
import BookCopy from "../../models/bookCopy.model.js";
import sequelize from "../../config/dbConnection.js";

/**
 * Lấy tất cả danh mục với thống kê:
 * - bookCount: số đầu sách thuộc category
 * - bookCopyCount: tổng số bản copy của các sách thuộc category
 * - borrowedCopy: số bản copy đang được mượn (status = 'BORROWED')
 *
 * Hiệu năng: dùng raw query với subquery để tránh N+1 và tối ưu tốc độ
 */
export const getAllCategories = async () => {
  // Raw query để tính toán tất cả trong 1 lần, tối ưu hiệu năng
  const [categories] = await sequelize.query(`
    SELECT 
      c.category_id,
      c.name,
      c.image,
      -- Số đầu sách thuộc category
      COUNT(DISTINCT bc.book_id) AS bookCount,
      -- Tổng số bản copy của các sách thuộc category
      COALESCE(SUM(
        (SELECT COUNT(*) FROM book_copies bcp WHERE bcp.book_id = bc.book_id)
      ), 0) AS bookCopyCount,
      -- Số bản copy đang được mượn
      COALESCE(SUM(
        (SELECT COUNT(*) FROM book_copies bcp WHERE bcp.book_id = bc.book_id AND bcp.status = 'BORROWED')
      ), 0) AS borrowedCopy
    FROM categories c
    LEFT JOIN book_categories bc ON c.category_id = bc.category_id
    GROUP BY c.category_id, c.name, c.image
    ORDER BY c.name ASC
  `);

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

// Lấy danh mục hot nhất: tổng lượt mượn (SUM books.total_borrow_count) theo từng category
// - Trả: category_id, name, image, totalBorrows
// - Sort giảm dần theo totalBorrows
// - Dùng LEFT JOIN để category không có sách vẫn trả về (totalBorrows = 0)
export const getHotCategories = async ({ limit = 20 } = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const rows = await Category.findAll({
    // Sửa alias để Sequelize hiểu đúng
    subQuery: false,
    attributes: [
      "category_id",
      "name",
      "image",
      [
        sequelize.fn("COUNT", sequelize.col("books.book_id")),
        "bookCount"
      ],
      // [
      //   sequelize.fn(
      //     "COALESCE",
      //     sequelize.fn("SUM", sequelize.col("books.total_borrow_count")),
      //     0
      //   ),
      //   "totalBorrows",
      // ],
      [
        sequelize.literal(
          "CAST(COALESCE(SUM(books.total_borrow_count), 0) AS UNSIGNED)"
        ),
        "totalBorrows",
      ],
    ],
    include: [
      {
        model: Book,
        as: "books",
        attributes: [],
        through: { attributes: [] },
        required: false,
      },
    ],
    group: ["Category.category_id", "Category.name"],
    // MySQL: order theo alias ok
    order: [[sequelize.literal("totalBorrows"), "DESC"]],
    limit: safeLimit,
    raw: true,
  });

  return { data: rows };
};