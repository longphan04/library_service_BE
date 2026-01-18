import sequelize from "../../config/dbConnection.js";
import { Op } from "sequelize";
import BookHold from "../../models/bookHold.model.js";
import BookCopy from "../../models/bookCopy.model.js";
import Book from "../../models/book.model.js";
import Category from "../../models/category.model.js";
import Author from "../../models/author.model.js";
import { appError } from "../../utils/appError.js";
import { updateBookCopyService } from "./bookCopy.service.js";

// thời gian giữ sách (phút)
const HOLD_EXPIRE_MINUTES = 10;

// thêm phút vào date
function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

// chuyển input thành mảng id số (hỗ trợ chuỗi phân tách dấu phẩy)
function toIdList(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  return String(value)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}
// lấy include book và copy cho hold (tối ưu field theo yêu cầu)
function holdIncludeBookAndCopy() {
  return [
    {
      model: BookCopy,
      as: "copy",
      attributes: ["copy_id", "note"],
      include: [
        {
          model: Book,
          as: "book",
          attributes: ["book_id", "title", "cover_url"],
          include: [
            { model: Category, as: "categories", attributes: ["category_id", "name"], through: { attributes: [] } },
            { model: Author, as: "authors", attributes: ["author_id", "name"], through: { attributes: [] } },
          ],
        },
      ],
    },
  ];
}

// lấy danh sách hold của member hiện tại
// - mỗi hold bao gồm thông tin sách, bản sao, expires_at
// GET /book-hold/me
export async function getMyBookHoldsService(memberId) {
  if (!memberId) throw appError("Chưa đăng nhập", 401);

  const rows = await BookHold.findAll({
    where: { member_id: memberId },
    attributes: ["hold_id", "expires_at"],
    include: holdIncludeBookAndCopy(),
    order: [["hold_id", "DESC"]], // tránh phụ thuộc created_at (có thể không tồn tại)
  });

  // normalize output
  return rows.map((h) => {
    const copy = h.copy;
    const book = copy?.book;

    return {
      hold_id: h.hold_id,
      expires_at: h.expires_at,
      copy: copy
        ? {
            copy_id: copy.copy_id,
            note: copy.note,
          }
        : null,
      book: book
        ? {
            book_id: book.book_id,
            title: book.title,
            cover_url: book.cover_url,
            categories: (book.categories ?? []).map((c) => ({
              category_id: c.category_id,
              name: c.name,
            })),
            authors: (book.authors ?? []).map((a) => ({
              author_id: a.author_id,
              name: a.name,
            })),
          }
        : null,
    };
  });
}

// thêm mới hold cho sách
// - chọn 1 bản sao AVAILABLE ngẫu nhiên & khoá nó
// - tạo hold (hết hạn sau 10 phút)
// - updateBookCopyService => HELD
// POST /book-hold
export async function createBookHoldService({ memberId, bookId } = {}) {
  if (!memberId) throw appError("Chưa đăng nhập", 401);
  const book_id = Number(bookId);
  if (!Number.isFinite(book_id)) throw appError("book_id không hợp lệ", 400);

  // FAST PATH: if book.available_copies already 0, reject without scanning copies
  const book = await Book.findByPk(book_id, { attributes: ["book_id", "available_copies"] });
  if (!book) throw appError("Không tìm thấy sách", 404);
  if ((book.available_copies ?? 0) <= 0) {
    throw appError("Sách hiện không còn bản sao khả dụng", 400);
  }

  const t = await sequelize.transaction();
  try {
    // Lock an AVAILABLE copy row to avoid 2 users taking the same copy.
    // NOTE: ORDER BY RAND() is OK here because we only fetch 1 row; if load is high,
    // consider using a better approach (e.g., pick by min(copy_id)).
    const copy = await BookCopy.findOne({
      where: { book_id, status: "AVAILABLE" },
      order: sequelize.literal("RAND()"),
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!copy) {
      // In case available_copies was stale
      throw appError("Sách hiện không còn bản sao khả dụng", 400);
    }

    const expiresAt = addMinutes(new Date(), HOLD_EXPIRE_MINUTES);

    // Create hold first (unique constraints will protect duplicates)
    const hold = await BookHold.create(
      {
        member_id: memberId,
        copy_id: copy.copy_id,
        expires_at: expiresAt,
      },
      { transaction: t }
    );

    // Update copy -> HELD inside same transaction so that recalc counters are consistent
    await copy.update({ status: "HELD" }, { transaction: t });
    // Reuse existing logic to recalc counters + return copy object (does its own tx)
    // We avoid nested transaction call here for speed/consistency.

    await t.commit();

    // After commit, use existing service to ensure counters are correct.
    // (It opens its own tx; acceptable here because hold is already created)
    await updateBookCopyService(copy.copy_id, { status: "HELD" });

    // Return hold with details
    const created = await BookHold.findByPk(hold.hold_id, {
      attributes: ["hold_id", "expires_at"],
      include: holdIncludeBookAndCopy(),
    });

    return created;
  } catch (e) {
    await t.rollback();

    // Handle unique constraint nicely
    if (String(e?.name) === "SequelizeUniqueConstraintError") {
      throw appError("Bản sao này đang được giữ bởi người khác hoặc bạn đã giữ rồi", 409);
    }
    throw e;
  }
}

// xoá 1 hoặc nhiều hold của member hiện tại
// - release bản sao nếu đang HELD
// DELETE /book-hold
export async function deleteMyBookHoldsService({ memberId, holdIds } = {}) {
  if (!memberId) throw appError("Chưa đăng nhập", 401);

  const ids = toIdList(holdIds);
  if (!ids.length) throw appError("Thiếu hold_ids", 400);

  // Lấy danh sách hold thuộc user + copy_id để xử lý release
  const holds = await BookHold.findAll({
    where: { hold_id: { [Op.in]: ids }, member_id: memberId },
    attributes: ["hold_id", "copy_id"],
  });

  if (!holds.length) return { deleted: 0 };

  const copyIds = [...new Set(holds.map((h) => h.copy_id).filter((x) => Number.isFinite(Number(x))))];

  // Xóa ngay (batch) để "dọn giỏ" trước, tránh giữ rác khi copy đã BORROWED
  await BookHold.destroy({
    where: { hold_id: { [Op.in]: holds.map((h) => h.hold_id) }, member_id: memberId },
  });

  // Chỉ release những copy đang HELD ở thời điểm hiện tại
  if (copyIds.length) {
    const heldCopies = await BookCopy.findAll({
      where: { copy_id: { [Op.in]: copyIds }, status: "HELD" },
      attributes: ["copy_id"],
    });

    for (const c of heldCopies) {
      await updateBookCopyService(c.copy_id, { status: "AVAILABLE" });
    }
  }

  return { deleted: holds.length };
}

// quét và xoá các hold đã hết hạn
// - trả lại trạng thái AVAILABLE cho các bản sao đang HELD
// được gọi bởi cron job
export async function sweepExpiredBookHoldsService({ limit = 200 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const now = new Date();

  const expired = await BookHold.findAll({
    where: { expires_at: { [Op.lte]: now } },
    attributes: ["hold_id", "member_id"],
    include: [{ model: BookCopy, as: "copy", attributes: ["copy_id", "status"] }],
    order: [["expires_at", "ASC"]],
    limit: safeLimit,
  });

  if (!expired.length) return { swept: 0 };

  // Delete holds in batch
  await BookHold.destroy({ where: { hold_id: { [Op.in]: expired.map((h) => h.hold_id) } } });

  // Release HELD copies
  const copyIds = expired.filter((h) => h.copy?.status === "HELD").map((h) => h.copy.copy_id);
  for (const copyId of copyIds) {
    const current = await BookCopy.findByPk(copyId, { attributes: ["copy_id", "status"] });
    if (current && current.status === "HELD") {
      await updateBookCopyService(copyId, { status: "AVAILABLE" });
    }
  }

  return { swept: expired.length };
}
