import * as bookService from "../services/book/book.service.js";

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
export async function getBookById(req, res, next) {
  try {
    const book = await bookService.getBookByIdService(req.params.id);
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
