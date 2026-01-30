import { Op } from "sequelize";
import Book from "../../models/book.model.js";
import Category from "../../models/category.model.js";
import Author from "../../models/author.model.js";
import Publisher from "../../models/publisher.model.js";

// URL server AI từ biến môi trường
const AI_SERVER_URL = process.env.AI_SERVER_URL || "";

// Timeout cho AI API (ms)
const AI_TIMEOUT_MS = 10000;

// Response mặc định khi không có kết quả
const EMPTY_AI_RESULT = Object.freeze({
  data: [],
  fromAI: true,
  pagination: { page: 1, limit: 0, totalItems: 0, totalPages: 1, hasNext: false },
});

/**
 * Gọi API AI để tìm kiếm sách theo keyword
 * @param {string} query - Từ khóa tìm kiếm
 * @returns {Promise<string[]|null>} - Mảng các identifier hoặc null nếu lỗi
 */
async function fetchAIIdentifiers(query) {
  if (!AI_SERVER_URL) {
    console.warn("[AI Search] AI_SERVER_URL chưa được cấu hình");
    return null;
  }

  try {
    const response = await fetch(`${AI_SERVER_URL}/ai/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[AI Search] API error: ${response.status}`);
      return null;
    }

    const json = await response.json();

    // Extract identifiers từ response: { data: { results: [...] } }
    const results = json?.data?.results;
    if (!Array.isArray(results) || !results.length) return null;

    // Lọc và lấy identifier hợp lệ
    const identifiers = [];
    for (const item of results) {
      const id = item?.identifier;
      if (typeof id === "string" && id.trim()) {
        identifiers.push(id.trim());
      }
    }

    return identifiers.length ? identifiers : null;
  } catch (error) {
    console.error("[AI Search] Error:", error?.message || error);
    return null;
  }
}

/**
 * Include khi lấy danh sách sách (giống format getAllBooks)
 */
function includeBookList() {
  return [
    { model: Publisher, as: "publisher", attributes: ["publisher_id", "name"] },
    { model: Category, as: "categories", attributes: ["category_id", "name"], through: { attributes: [] } },
    { model: Author, as: "authors", attributes: ["author_id", "name"], through: { attributes: [] } },
  ];
}

/**
 * Tìm sách trong DB theo danh sách identifier và sắp xếp theo thứ tự AI
 * @param {string[]} identifiers - Danh sách identifier từ AI (đã có thứ tự ưu tiên)
 * @returns {Promise<Object>} - Kết quả với data đã sắp xếp
 */
async function findBooksByIdentifiers(identifiers) {
  // Query 1 lần duy nhất, bao gồm cả identifier để sắp xếp
  const books = await Book.findAll({
    attributes: ["book_id", "identifier", "cover_url", "title", "available_copies", "total_borrow_count"],
    where: {
      identifier: { [Op.in]: identifiers },
      status: "ACTIVE",
    },
    include: includeBookList(),
  });

  if (!books.length) return EMPTY_AI_RESULT;

  // Tạo Map thứ tự từ AI (index càng nhỏ = score càng cao)
  const orderMap = new Map(identifiers.map((id, i) => [id, i]));

  // Sắp xếp theo thứ tự AI
  books.sort((a, b) => {
    const orderA = orderMap.get(a.identifier) ?? 9999;
    const orderB = orderMap.get(b.identifier) ?? 9999;
    return orderA - orderB;
  });

  // Loại bỏ identifier khỏi response (không cần trả về client)
  const data = books.map((book) => {
    const { identifier, ...rest } = book.toJSON();
    return rest;
  });

  return {
    data,
    fromAI: true,
    pagination: {
      page: 1,
      limit: data.length,
      totalItems: data.length,
      totalPages: 1,
      hasNext: false,
    },
  };
}

/**
 * Hàm chính: Tìm kiếm sách bằng AI khi DB không có kết quả
 * Được gọi từ controller khi getAllBooksService trả về rỗng
 *
 * Luồng xử lý:
 * 1. Gọi API AI với query -> lấy danh sách identifier
 * 2. Tìm sách trong DB theo các identifier
 * 3. Trả về kết quả đã sắp xếp theo độ ưu tiên AI
 *
 * @param {string} query - Từ khóa tìm kiếm
 * @returns {Promise<Object>} - Kết quả tìm kiếm từ AI
 */
export async function searchBooksByAI(query) {
  const q = String(query ?? "").trim();
  if (!q) return EMPTY_AI_RESULT;

  // Bước 1: Gọi API AI để lấy danh sách identifier
  const identifiers = await fetchAIIdentifiers(q);
  if (!identifiers) return EMPTY_AI_RESULT;

  // Bước 2: Tìm sách trong DB theo identifier
  return findBooksByIdentifiers(identifiers);
}
