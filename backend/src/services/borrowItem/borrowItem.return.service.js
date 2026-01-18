import sequelize from "../../config/dbConnection.js";
import Book from "../../models/book.model.js";
import BorrowItem from "../../models/borrowItem.model.js";

/**
 * Tính lại books.total_borrow_count dựa trên borrow_items có trạng thái RETURNED.
 *
 * Quy ước: chỉ tính những borrow_items.status = 'RETURNED'.
 *
 * Ghi chú hiệu năng:
 * - Chạy 1 query group trên borrow_items
 * - Sau đó cập nhật books theo batch để giảm số lần query
 */
export async function recalcTotalBorrowCountForAllBooks({ batchSize = 500 } = {}) {
  const safeBatch = Math.min(Math.max(Number(batchSize) || 500, 50), 5000);

  const rows = await BorrowItem.findAll({
    attributes: ["book_id", [sequelize.fn("COUNT", sequelize.col("borrow_item_id")), "cnt"]],
    where: { status: "RETURNED" },
    group: ["book_id"],
    raw: true,
  });

  const t = await sequelize.transaction();
  try {
    // reset trước để các sách không có lượt trả vẫn giữ 0
    await Book.update({ total_borrow_count: 0 }, { where: {}, transaction: t });

    for (let i = 0; i < rows.length; i += safeBatch) {
      const chunk = rows.slice(i, i + safeBatch);

      // build CASE update: set per book_id
      const ids = chunk.map((r) => Number(r.book_id)).filter((n) => Number.isFinite(n));
      if (!ids.length) continue;

      const cases = chunk
        .map((r) => {
          const id = Number(r.book_id);
          const cnt = Number(r.cnt);
          if (!Number.isFinite(id) || !Number.isFinite(cnt)) return null;
          return `WHEN ${id} THEN ${Math.trunc(cnt)}`;
        })
        .filter(Boolean)
        .join(" ");

      const sql = `
        UPDATE books
        SET total_borrow_count = CASE book_id
          ${cases}
          ELSE total_borrow_count
        END
        WHERE book_id IN (${ids.join(",")})
      `;

      await sequelize.query(sql, { transaction: t });
    }

    await t.commit();
    return { updatedBooks: rows.length };
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

/**
 * Tính lại books.total_borrow_count cho 1 cuốn sách.
 * Dùng khi vừa trả sách xong và muốn cập nhật ngay.
 */
export async function recalcTotalBorrowCountForBook(bookId, { transaction = null } = {}) {
  const id = Number(bookId);
  if (!Number.isFinite(id)) return null;

  const t = transaction ?? (await sequelize.transaction());
  const shouldCommit = !transaction;

  try {
    const cnt = await BorrowItem.count({ where: { book_id: id, status: "RETURNED" }, transaction: t });
    await Book.update({ total_borrow_count: cnt }, { where: { book_id: id }, transaction: t });

    if (shouldCommit) await t.commit();
    return { book_id: id, total_borrow_count: cnt };
  } catch (e) {
    if (shouldCommit) await t.rollback();
    throw e;
  }
}
