import { Op } from "sequelize";
import sequelize from "../config/dbConnection.js";
import Book from "../models/book.model.js";
import Category from "../models/category.model.js";
import Author from "../models/author.model.js";
import Publisher from "../models/publisher.model.js";
import Shelf from "../models/shelf.model.js";
import BookCopy from "../models/bookCopy.model.js";
import { saveUploadedImage, deletePublicImage } from "../middlewares/image.middleware.js";
import { appError } from "../utils/appError.js";
import { createAuthorService } from "../services/author.service.js";
import { createBookCopiesAutoService, addBookCopiesWithNextNoteService } from "../services/bookCopy.service.js";

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
function includeBookList({ categoryId } = {}) {
  const include = [
    { model: Publisher, as: "publisher", attributes: ["publisher_id", "name"] },
    { model: Category, as: "categories", attributes: ["category_id", "name"], through: { attributes: [] } },
    { model: Author, as: "authors", attributes: ["author_id", "name"], through: { attributes: [] } },
  ];

  // filter theo category (nếu có)
  if (categoryId) {
    include[1] = {
      ...include[1],
      where: { category_id: categoryId },
      required: true,
    };
  }

  return include;
}

// Cập lại tổng số bản sao và số bản sao khả dụng của sách
async function recalcCopyCounters(bookId, t) {
  const total = await BookCopy.count({ where: { book_id: bookId }, transaction: t });
  const available = await BookCopy.count({ where: { book_id: bookId, status: "AVAILABLE" }, transaction: t });
  await Book.update(
    { total_copies: total, available_copies: available },
    { where: { book_id: bookId }, transaction: t }
  );
}

// Lấy tất cả sách với filter, search, phân trang
// Yêu cầu: mặc định chỉ lấy status ACTIVE và chỉ trả về các field cần thiết để tối ưu tốc độ
export async function getAllBooksService({ q, status, categoryId, page = 1, limit = 18 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 18, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const where = {};

  // Mặc định chỉ lấy ACTIVE (trừ khi client truyền status khác)
  if (status) where.status = String(status).toUpperCase();
  else where.status = "ACTIVE";

  if (q) {
    where[Op.or] = [
      { title: { [Op.like]: `%${q}%` } },
      { isbn: { [Op.like]: `%${q}%` } },
    ];
  }

  const include = includeBookList({ categoryId });

  const { count, rows } = await Book.findAndCountAll({
    attributes: ["book_id", "cover_url", "title", "available_copies"],
    where,
    include,
    distinct: true, // tránh count sai khi join N-N
    order: [["book_id", "DESC"]], // Thay thế created_at bằng book_id
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
    ],
    include: includeBookDetail(),
  });
  if (!book) return null;
  return book;
}
// Tạo sách mới
export async function createBookService({
  authUserId,
  coverFile,
  isbn,
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
  const normalizedIsbn = isbn !== undefined && isbn !== null ? String(isbn).trim() : "";
  if (isbn !== undefined && isbn !== null && normalizedIsbn === "") {
    throw appError("ISBN không hợp lệ", 400);
  }

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
    if (normalizedIsbn) {
      const existed = await Book.findOne({ where: { isbn: normalizedIsbn }, transaction: t });
      if (existed) throw appError("ISBN đã tồn tại", 400);
    }

    // resolve authors: id | name (auto create)
    const authorIds = await resolveAuthorIds(author_ids, t);

    const book = await Book.create(
      {
        isbn: normalizedIsbn || null,
        title: String(title).trim(),
        description: description ?? null,
        publish_year: publish_year ?? null,
        language: language ?? null,
        cover_url: coverPath,
        publisher_id: publisher_id ?? null,
        shelf_id,
        status: status ? String(status).toUpperCase() : "ACTIVE",
        created_by: authUserId ?? null,
        updated_by: authUserId ?? null,
      },
      { transaction: t }
    );

    if (categoryIds.length) await book.setCategories(categoryIds, { transaction: t });
    if (authorIds.length) await book.setAuthors(authorIds, { transaction: t });

    // auto-create copies from quantity (tối đa 99)
    // IMPORTANT: dùng chung transaction để tránh lỗi "Không tìm thấy sách" khi book chưa commit
    if (qty && qty > 0) {
      await createBookCopiesAutoService({
        book_id: book.book_id,
        title: book.title,
        quantity: qty,
        transaction: t,
      });
    }

    await recalcCopyCounters(book.book_id, t);
    await t.commit();

    return Book.findByPk(book.book_id, { include: includeBookDetail() });
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
    isbn,
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

  const normalizedIsbn = isbn !== undefined && isbn !== null ? String(isbn).trim() : null;
  if (isbn !== undefined && isbn !== null && normalizedIsbn === "") {
    throw appError("ISBN không hợp lệ", 400);
  }

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
    // ===== ISBN: cho phép bỏ trống => NULL; nếu có thì check unique =====
    if (isbn !== undefined && normalizedIsbn) {
      if (normalizedIsbn !== String(book.isbn ?? "")) {
        const existed = await Book.findOne({
          where: { isbn: normalizedIsbn, book_id: { [Op.ne]: bookId } },
          transaction: t,
        });
        if (existed) throw appError("ISBN đã tồn tại", 400);
      }
    }

    // ===== Tác giả: id | name (auto create) =====
    const authorIds = author_ids !== undefined ? await resolveAuthorIds(author_ids, t) : null;

    // ===== Update thông tin book =====
    await book.update(
      {
        isbn: isbn !== undefined ? (normalizedIsbn || null) : book.isbn,
        title: title !== undefined ? String(title).trim() : book.title,
        description: description !== undefined ? description : book.description,
        publish_year: publish_year !== undefined ? publish_year : book.publish_year,
        language: language !== undefined ? language : book.language,
        publisher_id: publisher_id !== undefined ? publisher_id : book.publisher_id,
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
// - Chỉ lấy tối đa 5 kết quả
// - Match "đầu từ": keyword phải nằm ở đầu title hoặc ngay sau khoảng trắng
export async function suggestBooksService({ keyword, limit = 5 } = {}) {
  const kw = String(keyword ?? "").trim();
  if (!kw) {
    return { data: [] };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);

  // Match đầu chuỗi hoặc sau khoảng trắng.
  // Lưu ý: dùng LIKE để tương thích nhiều DB; nếu cần tối ưu có thể chuyển REGEXP/FTS tùy DB.
  const like1 = `${kw}%`;
  const like2 = `% ${kw}%`;

  const rows = await Book.findAll({
    attributes: ["book_id", "title", "isbn", "cover_url"],
    where: {
      [Op.and]: [
        { status: "ACTIVE" },
        {
          [Op.or]: [
            { title: { [Op.like]: like1 } },
            { title: { [Op.like]: like2 } },
          ],
        },
      ],
    },
    order: [["title", "ASC"]],
    limit: safeLimit,
  });

  return { data: rows };
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
