import { Op, QueryTypes } from "sequelize";
import sequelize from "../../config/dbConnection.js";
import BookView from "../../models/bookView.model.js";
import Book from "../../models/book.model.js";
import Category from "../../models/category.model.js";
import Author from "../../models/author.model.js";
import Publisher from "../../models/publisher.model.js";
import { clearOldBookViewsService } from "./clearBookView.service.js";

/**
 * Ghi lại hành vi xem chi tiết sách của user
 * Mỗi lần xem đều ghi 1 record mới (không check trùng)
 * Sau khi ghi xong sẽ xóa các view cũ để giữ tối đa 3 view mới nhất
 */
export async function logBookViewService({ userId, bookId }) {
  if (!userId || !bookId) return null;

  const view = await BookView.create({
    user_id: userId,
    book_id: bookId,
    viewed_at: new Date(),
  });

  // Xóa các view cũ không đồng bộ (không block response)
  clearOldBookViewsService(userId).catch(() => {});

  return view;
}

/**
 * Lấy danh sách sách gợi ý dựa trên lịch sử xem của user
 *
 * Thuật toán:
 * 1. Lấy 3 sách user xem gần nhất (distinct book_id, sắp xếp theo viewed_at mới nhất)
 * 2. Lấy category_id và author_id của các sách đó
 * 3. Tìm sách liên quan: cùng category HOẶC cùng author
 * 4. Loại bỏ: sách đã xem + sách đang mượn (chưa trả)
 * 5. Sắp xếp theo điểm liên quan (cùng category + cùng author) và lượt mượn
 *
 * @param {number} userId - ID của user
 * @param {number} limit - Số sách tối đa trả về (mặc định 12)
 * @returns {Object} { strategy, based_on, books }
 */
export async function getRecommendationsService({ userId, limit = 12 } = {}) {
  const targetLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);

  if (!userId) {
    return { strategy: "view_based", based_on: "recent_views", books: [] };
  }

  // 1. Lấy 3 sách xem gần nhất (distinct book_id, lấy viewed_at mới nhất của mỗi sách)
  const recentViews = await sequelize.query(
    `
    SELECT book_id
    FROM book_views
    WHERE user_id = :userId
    GROUP BY book_id
    ORDER BY MAX(viewed_at) DESC
    LIMIT 2
    `,
    {
      replacements: { userId },
      type: QueryTypes.SELECT,
    }
  );

  // Nếu chưa có view history → trả về danh sách rỗng
  if (!recentViews || recentViews.length === 0) {
    return { strategy: "view_based", based_on: "recent_views", books: [] };
  }

  const viewedBookIds = recentViews.map((r) => r.book_id);

  // 2. Lấy category_id và author_id của các sách đã xem
  const viewedCategories = await sequelize.query(
    `
    SELECT book_id, category_id
    FROM book_categories
    WHERE book_id IN (:viewedBookIds)
    `,
    {
      replacements: { viewedBookIds },
      type: QueryTypes.SELECT,
    }
  );

  const categoryIds = [...new Set(viewedCategories.map((r) => r.category_id).filter(Boolean))];

  // Nếu không có category và author → không gợi ý được
  if (categoryIds.length === 0) {
    return { strategy: "view_based", based_on: "recent_views", books: [] };
  }

  // 3. Lấy danh sách book_id đang mượn (PENDING, APPROVED, PICKED_UP - chưa trả)
  const borrowingBooks = await sequelize.query(
    `
    SELECT DISTINCT bi.book_id
    FROM borrow_items bi
    JOIN borrow_tickets bt ON bi.ticket_id = bt.ticket_id
    WHERE bt.member_id = :userId
      AND bt.status IN ('PENDING', 'APPROVED', 'PICKED_UP')
    `,
    {
      replacements: { userId },
      type: QueryTypes.SELECT,
    }
  );
  const borrowingBookIds = borrowingBooks.map((r) => r.book_id);

  // 4. Danh sách book_id cần loại bỏ = sách đã xem + sách đang mượn
  const excludeBookIds = [...new Set([...viewedBookIds, ...borrowingBookIds])];

  // 5. Query sách gợi ý với điểm liên quan
  // Điểm = 2 nếu cùng category VÀ cùng author, 1 nếu chỉ cùng 1 trong 2
  // Sắp xếp theo điểm cao trước, sau đó theo lượt mượn
  const recommendQuery = `
    SELECT
      b.book_id,
      COUNT(DISTINCT bc.category_id) AS relevance_score
    FROM books b
    JOIN book_categories bc ON b.book_id = bc.book_id
    JOIN book_categories vc 
      ON vc.category_id = bc.category_id
    WHERE
      vc.book_id IN (:viewedBookIds)
      AND b.book_id NOT IN (:excludeBookIds)
      AND b.status = 'ACTIVE'
    GROUP BY b.book_id
    HAVING relevance_score > 0
    ORDER BY relevance_score DESC, MAX(b.total_borrow_count) DESC
    LIMIT :targetLimit
  `;

  const recommendedBooks = await sequelize.query(recommendQuery, {
    replacements: {
      viewedBookIds,
      excludeBookIds: excludeBookIds.length ? excludeBookIds : [0],
      targetLimit,
    },
    type: QueryTypes.SELECT,
  });

  if (recommendedBooks.length === 0) {
    return { strategy: "view_based", based_on: "recent_views", books: [] };
  }

  // 6. Lấy thông tin đầy đủ của sách (categories, authors, publisher)
  const bookIds = recommendedBooks.map((r) => r.book_id);
  const relevanceMap = new Map(recommendedBooks.map((r) => [r.book_id, r.relevance_score]));

  const books = await Book.findAll({
    attributes: ["book_id", "cover_url", "title", "available_copies", "total_borrow_count"],
    where: { book_id: { [Op.in]: bookIds } },
    include: [
      { model: Publisher, as: "publisher", attributes: ["publisher_id", "name"] },
      { model: Category, as: "categories", attributes: ["category_id", "name"], through: { attributes: [] } },
      { model: Author, as: "authors", attributes: ["author_id", "name"], through: { attributes: [] } },
    ],
  });

  // Giữ nguyên thứ tự từ query (đã sắp xếp theo relevance_score và total_borrow_count)
  const bookMap = new Map(books.map((b) => [b.book_id, b]));
  const sortedBooks = bookIds.map((id) => bookMap.get(id)).filter(Boolean);

  return {
    strategy: "view_based",
    based_on: "recent_views",
    viewed_books: viewedBookIds,
    books: sortedBooks,
  };
}
