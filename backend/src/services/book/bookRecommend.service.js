import { Op, QueryTypes } from "sequelize";
import sequelize from "../../config/dbConnection.js";
import BookView from "../../models/bookView.model.js";
import Book from "../../models/book.model.js";
import Category from "../../models/category.model.js";
import Author from "../../models/author.model.js";
import Publisher from "../../models/publisher.model.js";

/**
 * Ghi lại hành vi xem chi tiết sách của user
 * Mỗi lần xem đều ghi 1 record mới (không check trùng)
 */
export async function logBookViewService({ userId, bookId }) {
  if (!userId || !bookId) return null;

  return await BookView.create({
    user_id: userId,
    book_id: bookId,
    viewed_at: new Date(),
  });
}

/**
 * Lấy danh sách sách gợi ý dựa trên lịch sử xem của user
 *
 * Thuật toán cải tiến:
 * 1. Lấy 3 sách user xem gần nhất
 * 2. Lấy category_id và author_id của các sách đó
 * 3. Tìm sách liên quan mức 1: cùng category HOẶC cùng author
 * 4. Nếu chưa đủ 12 sách, tìm mức 2: sách liên quan với các sách mức 1
 * 5. Chỉ loại bỏ sách đã mượn (KHÔNG loại sách đã xem)
 * 6. Sắp xếp: sách mức 1 trước, mức 2 sau, trong cùng mức ưu tiên lượt mượn cao
 *
 * @param {number} userId - ID của user
 * @param {number} limit - Số sách tối đa trả về (mặc định 12)
 * @returns {Object} { strategy, based_on, books }
 */
export async function getRecommendationsService({ userId, limit = 12 } = {}) {
  const targetLimit = Math.max(Number(limit) || 12, 12); // Tối thiểu 12 sách

  if (!userId) {
    return { strategy: "view_based", based_on: "recent_views", books: [] };
  }

  // 1. Lấy 3 sách xem gần nhất (distinct book_id)
  const recentViews = await sequelize.query(
    `
    SELECT book_id
    FROM book_views
    WHERE user_id = :userId
    GROUP BY book_id
    ORDER BY MAX(viewed_at) DESC
    LIMIT 3
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
  const categoryAuthorData = await sequelize.query(
    `
    SELECT DISTINCT bc.category_id, ba.author_id
    FROM books b
    LEFT JOIN book_categories bc ON b.book_id = bc.book_id
    LEFT JOIN book_authors ba ON b.book_id = ba.book_id
    WHERE b.book_id IN (:viewedBookIds)
    `,
    {
      replacements: { viewedBookIds },
      type: QueryTypes.SELECT,
    }
  );

  const categoryIds = [...new Set(categoryAuthorData.map((r) => r.category_id).filter(Boolean))];
  const authorIds = [...new Set(categoryAuthorData.map((r) => r.author_id).filter(Boolean))];

  // Nếu không có category và author → không gợi ý được
  if (categoryIds.length === 0 && authorIds.length === 0) {
    return { strategy: "view_based", based_on: "recent_views", books: [] };
  }

  // 3. Lấy danh sách book_id đã mượn (không bao gồm CANCELLED) - CHỈ loại bỏ sách đã mượn
  const borrowedBooks = await sequelize.query(
    `
    SELECT DISTINCT bi.book_id
    FROM borrow_items bi
    JOIN borrow_tickets bt ON bi.ticket_id = bt.ticket_id
    WHERE bt.member_id = :userId
      AND bt.status != 'CANCELLED'
    `,
    {
      replacements: { userId },
      type: QueryTypes.SELECT,
    }
  );
  const borrowedBookIds = borrowedBooks.map((r) => r.book_id);

  // 4. Tìm sách liên quan MỨC 1: cùng category HOẶC cùng author với sách đã xem
  let level1Query = `
    SELECT DISTINCT b.book_id, 1 AS relevance_level
    FROM books b
    WHERE b.status = 'ACTIVE'
  `;

  const conditions = [];
  if (categoryIds.length > 0) {
    conditions.push(`
      b.book_id IN (
        SELECT bc2.book_id FROM book_categories bc2 WHERE bc2.category_id IN (:categoryIds)
      )
    `);
  }
  if (authorIds.length > 0) {
    conditions.push(`
      b.book_id IN (
        SELECT ba2.book_id FROM book_authors ba2 WHERE ba2.author_id IN (:authorIds)
      )
    `);
  }

  if (conditions.length > 0) {
    level1Query += ` AND (${conditions.join(" OR ")})`;
  }

  // Loại bỏ sách đã mượn
  if (borrowedBookIds.length > 0) {
    level1Query += ` AND b.book_id NOT IN (:borrowedBookIds)`;
  }

  const level1Results = await sequelize.query(level1Query, {
    replacements: {
      categoryIds: categoryIds.length > 0 ? categoryIds : [0],
      authorIds: authorIds.length > 0 ? authorIds : [0],
      borrowedBookIds: borrowedBookIds.length > 0 ? borrowedBookIds : [0],
    },
    type: QueryTypes.SELECT,
  });

  const level1BookIds = level1Results.map((r) => r.book_id);

  // 5. Nếu chưa đủ targetLimit, tìm sách liên quan MỨC 2
  let level2BookIds = [];
  
  if (level1BookIds.length < targetLimit && level1BookIds.length > 0) {
    // Lấy category và author của các sách mức 1 để tìm sách liên quan thêm
    const level2CategoryAuthorData = await sequelize.query(
      `
      SELECT DISTINCT bc.category_id, ba.author_id
      FROM books b
      LEFT JOIN book_categories bc ON b.book_id = bc.book_id
      LEFT JOIN book_authors ba ON b.book_id = ba.book_id
      WHERE b.book_id IN (:level1BookIds)
      `,
      {
        replacements: { level1BookIds },
        type: QueryTypes.SELECT,
      }
    );

    const level2CategoryIds = [...new Set(level2CategoryAuthorData.map((r) => r.category_id).filter(Boolean))];
    const level2AuthorIds = [...new Set(level2CategoryAuthorData.map((r) => r.author_id).filter(Boolean))];

    if (level2CategoryIds.length > 0 || level2AuthorIds.length > 0) {
      let level2Query = `
        SELECT DISTINCT b.book_id, 2 AS relevance_level
        FROM books b
        WHERE b.status = 'ACTIVE'
      `;

      const level2Conditions = [];
      if (level2CategoryIds.length > 0) {
        level2Conditions.push(`
          b.book_id IN (
            SELECT bc3.book_id FROM book_categories bc3 WHERE bc3.category_id IN (:level2CategoryIds)
          )
        `);
      }
      if (level2AuthorIds.length > 0) {
        level2Conditions.push(`
          b.book_id IN (
            SELECT ba3.book_id FROM book_authors ba3 WHERE ba3.author_id IN (:level2AuthorIds)
          )
        `);
      }

      if (level2Conditions.length > 0) {
        level2Query += ` AND (${level2Conditions.join(" OR ")})`;
      }

      // Loại bỏ sách đã có trong level 1 và sách đã mượn
      const excludeIds = [...level1BookIds, ...borrowedBookIds];
      if (excludeIds.length > 0) {
        level2Query += ` AND b.book_id NOT IN (:excludeIds)`;
      }

      const level2Results = await sequelize.query(level2Query, {
        replacements: {
          level2CategoryIds: level2CategoryIds.length > 0 ? level2CategoryIds : [0],
          level2AuthorIds: level2AuthorIds.length > 0 ? level2AuthorIds : [0],
          excludeIds: excludeIds.length > 0 ? excludeIds : [0],
        },
        type: QueryTypes.SELECT,
      });

      level2BookIds = level2Results.map((r) => r.book_id);
    }
  }

  // 6. Gộp danh sách book_id theo mức độ liên quan
  const allRecommendBookIds = [
    ...level1BookIds.map(id => ({ book_id: id, relevance: 1 })),
    ...level2BookIds.map(id => ({ book_id: id, relevance: 2 }))
  ];

  if (allRecommendBookIds.length === 0) {
    return { strategy: "view_based", based_on: "recent_views", books: [] };
  }

  // 7. Lấy thông tin đầy đủ của sách
  const bookIds = allRecommendBookIds.map(r => r.book_id);
  
  const books = await Book.findAll({
    attributes: ["book_id", "cover_url", "title", "available_copies", "total_borrow_count"],
    where: { book_id: { [Op.in]: bookIds } },
    include: [
      { model: Publisher, as: "publisher", attributes: ["publisher_id", "name"] },
      { model: Category, as: "categories", attributes: ["category_id", "name"], through: { attributes: [] } },
      { model: Author, as: "authors", attributes: ["author_id", "name"], through: { attributes: [] } },
    ],
  });

  // Tạo map để sắp xếp theo mức độ liên quan
  const relevanceMap = new Map(allRecommendBookIds.map(r => [r.book_id, r.relevance]));

  // Sắp xếp: mức 1 trước (relevance=1), mức 2 sau (relevance=2)
  // Trong cùng mức, ưu tiên lượt mượn cao
  const sortedBooks = books.sort((a, b) => {
    const relevanceA = relevanceMap.get(a.book_id) || 999;
    const relevanceB = relevanceMap.get(b.book_id) || 999;
    
    if (relevanceA !== relevanceB) {
      return relevanceA - relevanceB; // Mức 1 (nhỏ hơn) lên trước
    }
    
    // Cùng mức thì ưu tiên lượt mượn cao
    return (b.total_borrow_count || 0) - (a.total_borrow_count || 0);
  });

  // Giới hạn số lượng trả về
  const limitedBooks = sortedBooks.slice(0, targetLimit);

  return {
    strategy: "view_based",
    based_on: "recent_views",
    books: limitedBooks,
    metadata: {
      level1_count: level1BookIds.length,
      level2_count: level2BookIds.length,
      total_found: sortedBooks.length,
    },
  };
}
