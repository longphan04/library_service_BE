import { Op } from "sequelize";
import sequelize from "../../config/dbConnection.js";
import Book from "../../models/book.model.js";
import Category from "../../models/category.model.js";
import Author from "../../models/author.model.js";
import Publisher from "../../models/publisher.model.js";
import Shelf from "../../models/shelf.model.js";
import BookCopy from "../../models/bookCopy.model.js";
import { saveUploadedImage, deletePublicImage } from "../../middlewares/image.middleware.js";
import { appError } from "../../utils/appError.js";
import { createAuthorService } from "../master-data/author.service.js";
import { createPublisherService } from "../master-data/publisher.service.js";
import { addBookCopiesWithNextNoteService, recalcCopyCounters } from "./bookCopy.service.js";

// hàm hỗ trợ parse danh sách id từ mảng hoặc chuỗi
function parseIdList(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  // hỗ trợ "1,2,3"
  return String(value)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

// include chi tiết khi lấy book by id (tối ưu field)
function includeBookDetail() {
  return [
    { model: Publisher, as: "publisher", attributes: ["publisher_id", "name"] },
    { model: Shelf, as: "shelf", attributes: ["shelf_id", "code"] },
    { model: Category, as: "categories", attributes: ["category_id", "name"], through: { attributes: [] } },
    { model: Author, as: "authors", attributes: ["author_id", "name"], through: { attributes: [] } },
  ];
}

// include khi list books (tối ưu field)
// Luôn trả về TẤT CẢ categories và authors của mỗi sách
// Việc filter theo category/author sẽ xử lý qua subquery WHERE
function includeBookList() {
  return [
    { model: Publisher, as: "publisher", attributes: ["publisher_id", "name"] },
    { model: Category, as: "categories", attributes: ["category_id", "name"], through: { attributes: [] } },
    { model: Author, as: "authors", attributes: ["author_id", "name"], through: { attributes: [] } },
  ];
}

// Lấy tất cả sách với filter, search, phân trang
// Yêu cầu: mặc định chỉ lấy status ACTIVE và chỉ trả về các field cần thiết để tối ưu tốc độ
export async function getAllBooksService({
  q,
  status,
  categoryId,
  authorId,
  publisherId,
  sort,
  page = 1,
  limit = 18,
} = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 18, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const where = {};

  // Mặc định chỉ lấy ACTIVE (trừ khi client truyền status khác)
  if (status) where.status = String(status).toUpperCase();
  else where.status = "ACTIVE";

  if (publisherId) {
    where.publisher_id = Number(publisherId);
  }

  if (q) {
    where[Op.or] = [{ title: { [Op.like]: `%${q}%` } }, { identifier: { [Op.like]: `%${q}%` } }];
  }

  // Filter theo category: dùng subquery để lấy book_id thuộc category đó
  // Nhưng include vẫn trả về TẤT CẢ categories của sách
  if (categoryId) {
    const categoryIds = parseIdList(categoryId);
    if (categoryIds && categoryIds.length) {
      // Subquery: lấy các book_id có thuộc categoryIds
      where.book_id = {
        [Op.in]: sequelize.literal(`(
          SELECT DISTINCT bc.book_id 
          FROM book_categories bc 
          WHERE bc.category_id IN (${categoryIds.join(",")})
        )`),
      };
    }
  }

  // Filter theo author: dùng subquery tương tự
  if (authorId) {
    const authorIds = parseIdList(authorId);
    if (authorIds && authorIds.length) {
      where.book_id = {
        ...(where.book_id || {}),
        [Op.in]: sequelize.literal(`(
          SELECT DISTINCT ba.book_id 
          FROM book_authors ba 
          WHERE ba.author_id IN (${authorIds.join(",")})
        )`),
      };
    }
  }

  // include luôn trả về đầy đủ categories và authors
  const include = includeBookList();

  // sort
  const sortKey = String(sort || "").toLowerCase();
  const order = [];
  if (sortKey === "popular") {
    order.push(["total_borrow_count", "DESC"]);
  } else if (sortKey === "newest") {
    order.push(["book_id", "DESC"]);
  } else {
    order.push(["total_borrow_count", "DESC"]);
  }

  const { count, rows } = await Book.findAndCountAll({
    attributes: ["book_id", "cover_url", "title", "available_copies", "total_borrow_count"],
    where,
    include,
    distinct: true, // tránh count sai khi join N-N
    order,
    limit: safeLimit,
    offset,
  });

  return {
    data: rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalItems: count,
      totalPages: Math.ceil(count / safeLimit) || 1,
      hasNext: offset + rows.length < count,
    },
  };
}

// Lấy sách theo ID (trang chi tiết) - chỉ trả về các field cần thiết
export async function getBookByIdService(bookId) {
  const book = await Book.findByPk(bookId, {
    attributes: [
      "book_id",
      "title",
      "description",
      "publish_year",
      "language",
      "cover_url",
      "total_copies",
      "available_copies",
      "total_borrow_count",
    ],
    include: includeBookDetail(),
  });
  if (!book) return null;
  return book;
}
// Lấy sách theo Identifier (trang chi tiết) - chỉ trả về các field cần thiết
export async function getBookByIdentifierService(identifier) {
  const book = await Book.findOne({
    attributes: [
      "book_id",
      "identifier",
      "title",
      "description",
      "publish_year",
      "language",
      "cover_url",
      "total_copies",
      "available_copies",
      "total_borrow_count",
    ],
    where: {
      identifier: String(identifier).trim(),
    },
    include: includeBookDetail(),
  });
  if (!book) return null;
  return book;
}

// Tạo sách mới
export async function createBookService({
  authUserId,
  coverFile,
  title,
  description,
  publish_year,
  language,
  publisher_id,
  shelf_id,
  status,
  category_ids,
  author_ids,
  copy_quantity,
  copies,
  quantity,
}) {
  if (!title || String(title).trim() === "") throw appError("Tiêu đề là bắt buộc", 400);
  if (!shelf_id) throw appError("shelf_id là bắt buộc", 400);

  const categoryIds = parseIdList(category_ids) || [];

  // upload cover trước, nếu fail DB thì rollback xóa file
  let coverPath = null;
  if (coverFile) {
    coverPath = await saveUploadedImage({ file: coverFile, type: "book" });
  }

  // FE có thể gửi nhiều key khác nhau cho số lượng copy
  const qtyRaw = copy_quantity ?? copies ?? quantity;
  const qty = toSafeInt(qtyRaw, { min: 0, max: 99 });
  if (qtyRaw !== undefined && qty === null) throw appError("Số lượng book copy không hợp lệ (0-99)", 400);

  const t = await sequelize.transaction();
  try {
    // Tự động sinh mã identifier (chuỗi số, unique)
    const identifier = await generateUniqueIdentifier(t);

    // xử lý danh sách tác giả: id | name (tự tạo nếu chưa có)
    const authorIds = await resolveAuthorIds(author_ids, t);

    // xử lý publisher: id | name (tự tạo nếu chưa có, giống logic author)
    const resolvedPublisherId = await resolvePublisherId(publisher_id, t);

    const book = await Book.create(
      {
        identifier,
        title: String(title).trim(),
        description: description ?? null,
        publish_year: publish_year ?? null,
        language: language ?? null,
        cover_url: coverPath,
        publisher_id: resolvedPublisherId,
        shelf_id,
        status: status ? String(status).toUpperCase() : "ACTIVE",
        created_by: authUserId ?? null,
        updated_by: authUserId ?? null,
      },
      { transaction: t }
    );

    if (categoryIds.length) await book.setCategories(categoryIds, { transaction: t });
    if (authorIds.length) await book.setAuthors(authorIds, { transaction: t });

    // Tạo book copy nhanh bằng bulkCreate để giảm số lần query
    if (qty && qty > 0) {
      const prefix = (String(book.title || "").trim()[0] || "X").toUpperCase().replace(/[^A-Z0-9]/g, "X");

      const barcodes = new Set();
      while (barcodes.size < qty) {
        barcodes.add(`LM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase());
      }

      let i = 1;
      const created = [];
      for (const bc of barcodes) {
        created.push({
          book_id: book.book_id,
          barcode: bc,
          status: "AVAILABLE",
          note: `${prefix}-${String(i++).padStart(2, "0")}`,
        });
      }

      await BookCopy.bulkCreate(created, { transaction: t, validate: false });
    }

    await recalcCopyCounters(book.book_id, t);
    await t.commit();

    // Trả về dữ liệu book theo format GET /book/:id (không trả về copies)
    return getBookByIdService(book.book_id);
  } catch (e) {
    await t.rollback();
    if (coverPath) await deletePublicImage(coverPath);
    throw e;
  }
}

export async function updateBookService(
  bookId,
  {
    authUserId,
    coverFile,
    title,
    description,
    publish_year,
    language,
    publisher_id,
    shelf_id,
    status,
    category_ids,
    author_ids,
    copy_quantity,
    copies,
    quantity,
  }
) {
  const book = await Book.findByPk(bookId);
  if (!book) return null;

  const categoryIds = parseIdList(category_ids);

  // FE có thể gửi field số lượng copy khi update (tổng mong muốn)
  // Chỉ cho phép tăng, không cho giảm, và tổng tối đa 99.
  const qtyRaw = copy_quantity ?? copies ?? quantity;
  const nextQty = toSafeInt(qtyRaw, { min: 0, max: 99 });
  if (qtyRaw !== undefined && nextQty === null) {
    throw appError("Số lượng book copy không hợp lệ (0-99)", 400);
  }

  // Nếu upload cover mới -> lưu trước; nếu update DB fail thì rollback và xóa cover mới
  const oldCover = book.cover_url;
  let newCover = null;
  if (coverFile) {
    newCover = await saveUploadedImage({ file: coverFile, type: "book" });
  }

  const t = await sequelize.transaction();
  try {
    // ===== Tác giả: id | name (auto create) =====
    const authorIds = author_ids !== undefined ? await resolveAuthorIds(author_ids, t) : null;

    // ===== Publisher: id | name (auto create, giống logic author) =====
    const resolvedPublisherId = publisher_id !== undefined ? await resolvePublisherId(publisher_id, t) : undefined;

    // ===== Update thông tin book (identifier không cho sửa vì được tự sinh) =====
    await book.update(
      {
        title: title !== undefined ? String(title).trim() : book.title,
        description: description !== undefined ? description : book.description,
        publish_year: publish_year !== undefined ? publish_year : book.publish_year,
        language: language !== undefined ? language : book.language,
        publisher_id: resolvedPublisherId !== undefined ? resolvedPublisherId : book.publisher_id,
        shelf_id: shelf_id !== undefined ? shelf_id : book.shelf_id,
        status: status !== undefined ? String(status).toUpperCase() : book.status,
        cover_url: newCover || book.cover_url,
        updated_by: authUserId ?? book.updated_by,
      },
      { transaction: t }
    );

    // ===== Update quan hệ N-N (nếu client có gửi) =====
    if (categoryIds) await book.setCategories(categoryIds, { transaction: t });
    if (authorIds) await book.setAuthors(authorIds, { transaction: t });

    // ===== Xử lý tăng số lượng bản sao (copy) =====
    // nextQty là tổng số bản sao mong muốn sau khi cập nhật.
    // - Nếu client không gửi số lượng thì bỏ qua.
    // - Nếu gửi nhỏ hơn hiện tại: báo lỗi.
    // - Nếu gửi lớn hơn: tạo thêm phần chênh lệch (delta).
    if (nextQty !== null) {
      const currentTotal = await BookCopy.count({ where: { book_id: bookId }, transaction: t });

      if (nextQty < currentTotal) {
        throw appError("Chỉ được tăng số lượng book copy, không được giảm", 400);
      }
      if (nextQty > 99) {
        throw appError("Tổng số book copy không được vượt quá 99", 400);
      }

      const add = nextQty - currentTotal;
      if (add > 0) {
        // NOTE: phải truyền cùng transaction để tránh lỗi dữ liệu chưa commit
        await addBookCopiesWithNextNoteService({
          book_id: bookId,
          title: book.title,
          addQuantity: add,
          transaction: t,
        });
      }
    }

    await recalcCopyCounters(book.book_id, t);
    await t.commit();

    // update OK thì xóa cover cũ
    if (newCover && oldCover) await deletePublicImage(oldCover);

    return Book.findByPk(book.book_id, { include: includeBookDetail() });
  } catch (e) {
    await t.rollback();
    if (newCover) await deletePublicImage(newCover);
    throw e;
  }
}

export async function deleteBookService(bookId) {
  const book = await Book.findByPk(bookId, { include: [{ model: BookCopy, as: "copies" }] });
  if (!book) return false;

  const blocked = (book.copies || []).some((c) => c.status === "BORROWED" || c.status === "HELD");
  if (blocked) throw appError("vẫn còn sách đang được mượn, không thể xóa", 400);

  const cover = book.cover_url;
  await book.destroy();

  if (cover) await deletePublicImage(cover);
  return true;
}

// Gợi ý sách theo keyword (autocomplete)
// - Mặc định lấy tối đa 10 kết quả
// - Match theo tiền tố (prefix): title bắt đầu bằng keyword
// - Trả về danh sách title KHÔNG TRÙNG (distinct)
// - Chỉ trả về title, không cần book_id
// export async function suggestBooksService({ keyword, limit = 10 } = {}) {
//   const kw = String(keyword ?? "").trim();
//   if (!kw) {
//     return { data: [] };
//   }

//   const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 10);

//   // Dùng DISTINCT để lấy các title không trùng
//   // Group by title để đảm bảo mỗi title chỉ xuất hiện 1 lần
//   const rows = await Book.findAll({
//     attributes: [[sequelize.fn("DISTINCT", sequelize.col("title")), "title"]],
//     where: {
//       status: "ACTIVE",
//       title: { [Op.like]: `${kw}%` },
//     },
//     order: [["title", "ASC"]],
//     limit: safeLimit,
//     raw: true,
//   });

//   // Chỉ trả về mảng các title (string)
//   return { data: rows.map((r) => r.title) };
// }
export async function suggestBooksService({ keyword, limit = 10 } = {}) {
  const kw = String(keyword ?? "").trim();
  if (!kw) {
    return { data: [] };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 10);

  const rows = await Book.findAll({
    attributes: [
      [
        // DISTINCT nhưng phân biệt dấu (THIEN ≠ THIÊN)
        sequelize.literal("DISTINCT title COLLATE utf8mb4_bin"),
        "title",
      ],
    ],
    where: {
      status: "ACTIVE",
      // LIKE vẫn giữ để gợi ý theo prefix
      title: {
        [Op.like]: `${kw}%`,
      },
    },
    order: [
      // order cũng phải cùng collation để tránh warning / sort sai
      [sequelize.literal("title COLLATE utf8mb4_bin"), "ASC"],
    ],
    limit: safeLimit,
    raw: true,
  });

  return {
    data: rows.map((r) => r.title),
  };
}

/**
 * Chuyển dữ liệu đầu vào về số nguyên an toàn.
 * - Trả về null nếu không hợp lệ.
 * - Dùng cho các field số lượng (0..99).
 */
function toSafeInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < min || i > max) return null;
  return i;
}

/**
 * Sinh mã identifier tự động cho sách (chuỗi số, unique).
 * Format: YYYYMMDDHHmmssSSS + 3 số random = 20 ký tự số
 * - YYYY: năm 4 chữ số
 * - MM: tháng 2 chữ số  
 * - DD: ngày 2 chữ số
 * - HH: giờ 2 chữ số
 * - mm: phút 2 chữ số
 * - ss: giây 2 chữ số
 * - SSS: mili giây 3 chữ số
 * - XXX: 3 số ngẫu nhiên để tránh trùng
 * @param {Transaction} t - Sequelize transaction
 * @param {number} maxRetry - Số lần thử lại tối đa nếu trùng
 * @returns {Promise<string>} Mã identifier unique
 */
async function generateUniqueIdentifier(t, maxRetry = 5) {
  for (let i = 0; i < maxRetry; i++) {
    const now = new Date();
    // Tạo chuỗi số từ timestamp: YYYYMMDDHHmmssSSS
    const dateStr = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") +
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0") +
      String(now.getSeconds()).padStart(2, "0") +
      String(now.getMilliseconds()).padStart(3, "0");
    
    // Thêm 3 số ngẫu nhiên để tránh trùng khi tạo cùng lúc
    const randomSuffix = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    const identifier = dateStr + randomSuffix;

    // Kiểm tra identifier đã tồn tại chưa
    const existed = await Book.findOne({
      where: { identifier },
      transaction: t,
    });

    if (!existed) return identifier;

    // Nếu trùng, đợi 1ms rồi thử lại
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  throw appError("Không thể sinh mã định danh sách, vui lòng thử lại", 500);
}

/**
 * Chuẩn hóa input tác giả từ FE.
 * Hỗ trợ:
 * - Array: [1, 2, "Nguyễn Văn A"]
 * - CSV: "1,2,Nguyễn Văn A"
 * - JSON string (multipart/form-data): "[1,2,\"Nguyễn Văn A\"]"
 */
function parseAuthorsInput(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;

  const s = String(value).trim();
  if (!s) return [];

  // JSON string array (multipart/form-data hay dùng)
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [s];
    }
  }

  // CSV "1,2,Nguyen Van A"
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

/**
 * Resolve danh sách tác giả thành mảng author_id.
 * - Nếu phần tử là số => coi là author_id.
 * - Nếu là string => coi là tên tác giả, tự tạo nếu chưa có.
 * - Nếu là object => ưu tiên {author_id|id}, nếu không có thì dùng {name}.
 */
async function resolveAuthorIds(inputAuthors, t) {
  const items = parseAuthorsInput(inputAuthors);
  if (!items.length) return [];

  const ids = [];
  for (const item of items) {
    // number / numeric string => author_id
    const n = Number(item);
    if (Number.isFinite(n) && String(item).trim() !== "") {
      ids.push(Math.trunc(n));
      continue;
    }

    // object: {author_id} | {id} | {name}
    if (item && typeof item === "object") {
      const maybeId = item.author_id ?? item.id;
      const maybeIdNum = Number(maybeId);
      if (Number.isFinite(maybeIdNum)) {
        ids.push(Math.trunc(maybeIdNum));
        continue;
      }

      const name = item.name;
      if (name && String(name).trim()) {
        const created = await createAuthorService({ name: String(name).trim(), bio: item.bio }, t);
        ids.push(created.author_id);
        continue;
      }

      throw appError("Dữ liệu tác giả không hợp lệ", 400);
    }

    // string name
    const name = String(item).trim();
    if (!name) continue;
    const created = await createAuthorService({ name }, t);
    ids.push(created.author_id);
  }

  return [...new Set(ids)].filter((x) => Number.isFinite(Number(x)));
}

/**
 * Chuẩn hóa input publisher từ FE.
 * Hỗ trợ: number (id), string (name hoặc id), object {publisher_id|id|name}
 */
function parsePublisherInput(value) {
  if (value === undefined || value === null || value === "") return null;

  // nếu là JSON string (multipart/form-data)
  const s = String(value).trim();
  if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }

  return value;
}

/**
 * Resolve publisher thành publisher_id.
 * - Nếu là số hoặc chuỗi số => coi là publisher_id.
 * - Nếu là string (không phải số) => coi là tên publisher, tự tạo nếu chưa có.
 * - Nếu là object => ưu tiên {publisher_id|id}, nếu không có thì dùng {name}.
 */
async function resolvePublisherId(inputPublisher, t) {
  const item = parsePublisherInput(inputPublisher);
  if (item === null) return null;

  // number => publisher_id
  const n = Number(item);
  if (Number.isFinite(n) && String(item).trim() !== "") {
    return Math.trunc(n);
  }

  // object: {publisher_id} | {id} | {name}
  if (item && typeof item === "object") {
    const maybeId = item.publisher_id ?? item.id;
    const maybeIdNum = Number(maybeId);
    if (Number.isFinite(maybeIdNum)) {
      return Math.trunc(maybeIdNum);
    }

    const name = item.name;
    if (name && String(name).trim()) {
      const created = await createPublisherService({ name: String(name).trim() }, t);
      return created.publisher_id;
    }

    throw appError("Dữ liệu nhà xuất bản không hợp lệ", 400);
  }

  // string name => tự tạo nếu chưa có
  const name = String(item).trim();
  if (!name) return null;
  const created = await createPublisherService({ name }, t);
  return created.publisher_id;
}
