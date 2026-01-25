import * as bookService from "../services/book/book.service.js";
import * as bookRecommendService from "../services/book/bookRecommend.service.js";

// GET /books
export async function getAllBooks(req, res, next) {
  try {
    const { q, status, categoryId, authorId, publisherId, sort, page, limit } = req.query;

    const result = await bookService.getAllBooksService({
      q,
      status,
      categoryId,
      authorId,
      publisherId,
      sort,
      page,
      limit,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// GET /books/:id
// Nếu user đã đăng nhập → ghi lại hành vi xem sách
export async function getBookById(req, res, next) {
  try {
    const book = await bookService.getBookByIdService(req.params.id);
    if (!book) return res.status(404).json({ message: "Không tìm thấy sách" });

    // Ghi log view nếu user đã đăng nhập (không await để không block response)
    const userId = req.auth?.user_id;
    if (userId && book.book_id) {
      bookRecommendService.logBookViewService({ userId, bookId: book.book_id }).catch(() => {});
    }

    return res.json(book);
  } catch (e) {
    next(e);
  }
}
// GET /books/identifier/:identifier
export async function getBookByIdentifier(req, res, next) {
  try {
    const book = await bookService.getBookByIdentifierService(req.params.identifier);
    if (!book) return res.status(404).json({ message: "Không tìm thấy sách" });
    return res.json(book);
  } catch (e) {
    next(e);
  }
}

// POST /books
export async function createBook(req, res, next) {
  try {
    const authUserId = req.auth?.user_id;

    const created = await bookService.createBookService({
      // để authUserId ở dưới cùng để tránh bị ghi đè bởi req.body
      coverFile: req.file,
      ...req.body,
      authUserId,
    });

    return res.status(201).json(created);
  } catch (e) {
    next(e);
  }
}

// PUT /books/:id
export async function updateBook(req, res, next) {
  try {
    const authUserId = req.auth?.user_id;

    const updated = await bookService.updateBookService(req.params.id, {
      authUserId,
      coverFile: req.file,
      ...req.body,
    });

    if (!updated) return res.status(404).json({ message: "Không tìm thấy sách" });
    return res.json(updated);
  } catch (e) {
    next(e);
  }
}

// DELETE /books/:id
export async function deleteBook(req, res, next) {
  try {
    const ok = await bookService.deleteBookService(req.params.id);
    if (!ok) return res.status(404).json({ message: "Không tìm thấy sách" });
    return res.status(204).send();
  } catch (e) {
    next(e);
  }
}

// GET /books/suggest?q=...
export async function suggestBooks(req, res, next) {
  try {
    const keyword = req.query.q ?? req.query.keyword;
    const limit = req.query.limit;

    const result = await bookService.suggestBooksService({ keyword, limit });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// GET /books/recommendation
// Gợi ý sách dựa trên lịch sử xem của user (chỉ cho user đã đăng nhập)
export async function getRecommendations(req, res, next) {
  try {
    const userId = req.auth?.user_id;
    const limit = req.query.limit;

    const result = await bookRecommendService.getRecommendationsService({
      userId,
      limit,
    });

    return res.json(result);
  } catch (error) {
    next(error);
  }
}
