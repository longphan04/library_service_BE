import sequelize from "../../config/dbConnection.js";
import { Op } from "sequelize";
import Book from "../../models/book.model.js";
import BookCopy from "../../models/bookCopy.model.js";
import { appError } from "../../utils/appError.js";

// Cập lại tổng số bản sao và số bản sao khả dụng của sách
export async function recalcCopyCounters(bookId, t) {
  const total = await BookCopy.count({ where: { book_id: bookId }, transaction: t });
  const available = await BookCopy.count({ where: { book_id: bookId, status: "AVAILABLE" }, transaction: t });
  await Book.update(
    { total_copies: total, available_copies: available },
    { where: { book_id: bookId }, transaction: t }
  );
}

// Lấy tất cả bản sao của một cuốn sách
export async function getAllBookCopyService(bookId) {
  const book = await Book.findByPk(bookId);
  if (!book) throw appError("Không tìm thấy sách", 404);

  return BookCopy.findAll({
    where: { book_id: bookId },
    order: [["created_at", "DESC"]],
  });
}

// Lấy bản sao sách theo ID
export async function getBookCopyByIdService(copyId) {
  return BookCopy.findByPk(copyId, {
    include: [{ model: Book, as: "book" }],
  });
}

// Tạo nhiều book copy tự sinh barcode + note theo format: <prefix>-01..99
// - prefix = chữ cái đầu của title (upper)
// - quantity: 1..99
export async function createBookCopiesAutoService({ book_id, title, quantity, acquired_at = null, transaction = null } = {}) {
  if (!book_id) throw appError("Thiếu book_id", 400);

  const qty = toSafeInt(quantity, { min: 0, max: 99 });
  if (qty === null) throw appError("Số lượng book copy không hợp lệ", 400);
  if (qty === 0) return [];

  const book = await Book.findByPk(book_id, transaction ? { transaction } : undefined);
  if (!book) throw appError("Không tìm thấy sách", 404);

  const prefix = buildNotePrefixFromTitle(title ?? book.title);

  const t = transaction ?? (await sequelize.transaction());
  const shouldCommit = !transaction;

  try {
    const created = [];
    for (let i = 1; i <= qty; i++) {
      const barcode = await createUniqueBarcode(t);
      const note = `${prefix}-${pad2(i)}`;
      const copy = await BookCopy.create(
        {
          book_id,
          barcode,
          status: "AVAILABLE",
          acquired_at,
          note,
        },
        { transaction: t }
      );
      created.push(copy);
    }

    await recalcCopyCounters(book_id, t);

    if (shouldCommit) await t.commit();
    return created;
  } catch (e) {
    if (shouldCommit) await t.rollback();
    throw e;
  }
}

function toSafeInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < min || i > max) return null;
  return i;
}

function buildNotePrefixFromTitle(title) {
  const s = String(title || "").trim();
  const first = s ? s[0].toUpperCase() : "X";
  // chỉ lấy 1 ký tự chữ/số để note gọn
  return /[A-Z0-9]/.test(first) ? first : "X";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function generateBarcode() {
  // barcode unique: LM-<timestamp36>-<rand36>
  return `LM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

async function createUniqueBarcode(t, maxRetry = 5) {
  for (let i = 0; i < maxRetry; i++) {
    const candidate = generateBarcode();
    const existed = await BookCopy.findOne({ where: { barcode: candidate }, transaction: t });
    if (!existed) return candidate;
  }
  throw appError("Không thể tạo barcode duy nhất", 500);
}

/**
 * Tạo bản sao sách
 * Cho phép API cũ: nếu client không gửi barcode thì tự sinh.
 */
export async function createBookCopyService({ book_id, barcode, status, acquired_at, note }) {
  if (!book_id) throw appError("Thiếu book_id", 400);

  const rawBarcode = barcode && String(barcode).trim();

  const book = await Book.findByPk(book_id);
  if (!book) throw appError("Không tìm thấy sách", 404);

  const t = await sequelize.transaction();
  try {
    const finalBarcode = rawBarcode ? rawBarcode : await createUniqueBarcode(t);

    if (rawBarcode) {
      const existed = await BookCopy.findOne({ where: { barcode: finalBarcode }, transaction: t });
      if (existed) throw appError("barcode đã tồn tại", 400);
    }

    const copy = await BookCopy.create(
      {
        book_id,
        barcode: finalBarcode,
        status: status ? String(status).toUpperCase() : "AVAILABLE",
        acquired_at: acquired_at ?? null,
        note: note ?? null,
      },
      { transaction: t }
    );

    await recalcCopyCounters(book_id, t);
    await t.commit();
    return copy;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

// Cập nhật bản sao sách (chỉ cho cập nhật trạng thái - status)
export async function updateBookCopyService(copyId, { status } = {}, { transaction = null } = {}) {
  const copy = await BookCopy.findByPk(copyId, transaction ? { transaction } : undefined);
  if (!copy) return null;

  const nextStatus = status ? String(status).trim().toUpperCase() : null;
  if (!nextStatus) throw appError("Thiếu status", 400);

  const t = transaction ?? (await sequelize.transaction());
  const shouldCommit = !transaction;

  try {
    await copy.update(
      {
        status: nextStatus,
      },
      { transaction: t }
    );

    await recalcCopyCounters(copy.book_id, t);

    if (shouldCommit) await t.commit();
    return copy;
  } catch (e) {
    if (shouldCommit) await t.rollback();
    throw e;
  }
}

// Xóa bản sao sách
export async function deleteBookCopyService(copyId) {
  const copy = await BookCopy.findByPk(copyId);
  if (!copy) return false;

  // chặn xóa nếu đang BORROWED hoặc HELD
  if (copy.status === "BORROWED" || copy.status === "HELD") {
    throw appError("Không thể xóa bản sao đang mượn/giữ", 400);
  }

  const t = await sequelize.transaction();
  try {
    await copy.destroy({ transaction: t });
    await recalcCopyCounters(copy.book_id, t);
    await t.commit();
    return true;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

// Tổng logic cho phần sửa đổi số lượng đầu sách để thêm bookcopy

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseNoteIndex(note, prefix) {
  const m = String(note || "").match(new RegExp(`^${escapeRegExp(prefix)}-(\\d{2})$`, "i"));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

async function getLastNoteIndex(book_id, prefix, t) {
  const rows = await BookCopy.findAll({
    where: { book_id, note: { [Op.like]: `${prefix}-%` } },
    attributes: ["note"],
    transaction: t,
  });

  let max = 0;
  for (const r of rows) {
    const idx = parseNoteIndex(r.note, prefix);
    if (idx && idx > max) max = idx;
  }
  return max;
}

/**
 * Tăng thêm book copy (KHÔNG giảm), đảm bảo tổng <= 99.
 * note tiếp tục từ số cuối cùng hiện có: T-12 => thêm 5 -> T-13..T-17.
 */
export async function addBookCopiesWithNextNoteService({ book_id, title, addQuantity, acquired_at = null, transaction = null } = {}) {
  if (!book_id) throw appError("Thiếu book_id", 400);

  const add = toSafeInt(addQuantity, { min: 0, max: 99 });
  if (add === null) throw appError("Số lượng tăng thêm không hợp lệ", 400);
  if (add === 0) return [];

  const book = await Book.findByPk(book_id, transaction ? { transaction } : undefined);
  if (!book) throw appError("Không tìm thấy sách", 404);

  const prefix = buildNotePrefixFromTitle(title ?? book.title);

  const t = transaction ?? (await sequelize.transaction());
  const shouldCommit = !transaction;

  try {
    const currentTotal = await BookCopy.count({ where: { book_id }, transaction: t });
    if (currentTotal + add > 99) {
      throw appError("Tổng số book copy không được vượt quá 99", 400);
    }

    const lastIdx = await getLastNoteIndex(book_id, prefix, t);

    const created = [];
    for (let i = 1; i <= add; i++) {
      const nextIdx = lastIdx + i;
      if (nextIdx > 99) throw appError("Tổng số book copy không được vượt quá 99", 400);

      const barcode = await createUniqueBarcode(t);
      const note = `${prefix}-${pad2(nextIdx)}`;

      const copy = await BookCopy.create(
        {
          book_id,
          barcode,
          status: "AVAILABLE",
          acquired_at,
          note,
        },
        { transaction: t }
      );
      created.push(copy);
    }

    await recalcCopyCounters(book_id, t);

    if (shouldCommit) await t.commit();
    return created;
  } catch (e) {
    if (shouldCommit) await t.rollback();
    throw e;
  }
}
