import * as bookCopyService from "../services/book/bookCopy.service.js";

// GET /book-copies/:bookId
export async function getAllBookCopy(req, res, next) {
  try {
    const result = await bookCopyService.getAllBookCopyService(req.params.bookId);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// GET /book-copies/:id
export async function getBookCopyById(req, res, next) {
  try {
    const result = await bookCopyService.getBookCopyByIdService(req.params.id);
    if (!result) return res.status(404).json({ message: "Không tìm thấy bản sao" });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// POST /book-copies
export async function createBookCopy(req, res, next) {
  try {
    const created = await bookCopyService.createBookCopyService({
      ...req.body,
    });
    return res.status(201).json(created);
  } catch (e) {
    next(e);
  }
}

// PUT /book-copies/:id
export async function updateBookCopy(req, res, next) {
  try {
    const updated = await bookCopyService.updateBookCopyService(req.params.id, {
      ...req.body,
    });
    if (!updated) return res.status(404).json({ message: "Không tìm thấy bản sao" });
    return res.json(updated);
  } catch (e) {
    next(e);
  }
}

// DELETE /book-copies/:id
export async function deleteBookCopy(req, res, next) {
  try {
    const ok = await bookCopyService.deleteBookCopyService(req.params.id);
    if (!ok) return res.status(404).json({ message: "Không tìm thấy bản sao" });
    return res.status(204).send();
  } catch (e) {
    next(e);
  }
}
