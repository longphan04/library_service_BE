import Category from "../../models/category.model.js";
import Author from "../../models/author.model.js";

// URL server AI từ biến môi trường
const AI_SERVER_URL = process.env.AI_SERVER_URL || "";

/**
 * Tạo nội dung file txt từ thông tin sách
 * Format:
 * Tiêu đề: {title}
 * Mã định danh: {identifier}
 * Tác giả: {author names}
 * Thể loại: {category names}
 * Năm xuất bản: {publish_year}
 * Tóm tắt nội dung: {description}
 * 
 * @param {Object} bookInfo - Thông tin sách cần format
 * @returns {string} - Nội dung file txt
 */
function formatBookToTxt(bookInfo) {
  const { title, identifier, authorNames, categoryNames, publish_year, description } = bookInfo;

  const lines = [
    `Tiêu đề: ${title || ""}`,
    `Mã định danh: ${identifier || ""}`,
    `Tác giả: ${authorNames || ""}`,
    `Thể loại: ${categoryNames || ""}`,
    `Năm xuất bản: ${publish_year || ""}`,
    `Tóm tắt nội dung: ${description || ""}`,
  ];

  return lines.join("\n");
}

/**
 * Lấy tên các tác giả từ danh sách author_ids
 * @param {Array} authorIds - Mảng id tác giả
 * @returns {Promise<string>} - Chuỗi tên tác giả, phân cách bằng dấu phẩy
 */
async function getAuthorNames(authorIds) {
  if (!authorIds || !authorIds.length) return "";

  const authors = await Author.findAll({
    attributes: ["name"],
    where: { author_id: authorIds },
  });

  return authors.map((a) => a.name).join(", ");
}

/**
 * Lấy tên các thể loại từ danh sách category_ids
 * @param {Array} categoryIds - Mảng id thể loại
 * @returns {Promise<string>} - Chuỗi tên thể loại, phân cách bằng dấu phẩy
 */
async function getCategoryNames(categoryIds) {
  if (!categoryIds || !categoryIds.length) return "";

  const categories = await Category.findAll({
    attributes: ["name"],
    where: { category_id: categoryIds },
  });

  return categories.map((c) => c.name).join(", ");
}

/**
 * Gửi file txt chứa thông tin sách đến server AI để đồng bộ
 * Sử dụng FormData để gửi file
 * 
 * @param {string} txtContent - Nội dung file txt
 * @param {string} filename - Tên file (mặc định: book_sync.txt)
 * @returns {Promise<boolean>} - true nếu gửi thành công
 */
async function sendTxtToAIServer(txtContent, filename = "book_sync.txt") {
  if (!AI_SERVER_URL) {
    console.warn("[AI Sync] AI_SERVER_URL chưa được cấu hình");
    return false;
  }

  try {
    // Tạo Blob từ nội dung txt
    const blob = new Blob([txtContent], { type: "text/plain" });
    
    // Tạo FormData để gửi file
    const formData = new FormData();
    formData.append("file", blob, filename);

    const response = await fetch(`${AI_SERVER_URL}/ai/data/sync`, {
      method: "POST",
      body: formData,
      // timeout 15 giây
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`[AI Sync] API trả về lỗi: ${response.status}`);
      return false;
    }

    console.log(`[AI Sync] Đồng bộ sách thành công: ${filename}`);
    return true;
  } catch (error) {
    // Không throw lỗi để không ảnh hưởng flow chính
    console.error("[AI Sync] Lỗi khi gửi file đến AI server:", error?.message || error);
    return false;
  }
}

/**
 * Hàm chính: Đồng bộ thông tin sách mới thêm với AI server
 * Được gọi sau khi tạo sách thành công trong createBookService
 * 
 * Luồng xử lý:
 * 1. Lấy tên tác giả và thể loại từ DB
 * 2. Format thông tin sách thành nội dung txt
 * 3. Gửi file txt đến AI server
 * (Không cần giữ file txt ở BE)
 * 
 * @param {Object} params - Thông tin sách
 * @param {string} params.title - Tiêu đề sách
 * @param {string} params.identifier - Mã định danh
 * @param {Array} params.author_ids - Mảng id tác giả
 * @param {Array} params.category_ids - Mảng id thể loại
 * @param {number} params.publish_year - Năm xuất bản
 * @param {string} params.description - Tóm tắt nội dung
 * @returns {Promise<boolean>} - true nếu đồng bộ thành công
 */
export async function syncBookToAI({
  title,
  identifier,
  author_ids,
  category_ids,
  publish_year,
  description,
} = {}) {
  try {
    // Lấy tên tác giả và thể loại (chạy song song để tối ưu)
    const [authorNames, categoryNames] = await Promise.all([
      getAuthorNames(author_ids),
      getCategoryNames(category_ids),
    ]);

    // Format thông tin sách thành txt
    const txtContent = formatBookToTxt({
      title,
      identifier,
      authorNames,
      categoryNames,
      publish_year,
      description,
    });

    // Tạo tên file unique (dùng identifier hoặc timestamp)
    const safeIdentifier = String(identifier || Date.now()).replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `book_${safeIdentifier}.txt`;

    // Gửi đến AI server (không await để không block response)
    // Chạy async để không ảnh hưởng performance của API tạo sách
    sendTxtToAIServer(txtContent, filename).catch((err) => {
      console.error("[AI Sync] Lỗi không mong đợi:", err?.message || err);
    });

    return true;
  } catch (error) {
    console.error("[AI Sync] Lỗi khi chuẩn bị dữ liệu:", error?.message || error);
    return false;
  }
}
