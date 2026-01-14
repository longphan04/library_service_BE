import * as authorService from "../services/author.service.js";

// GET /authors
export async function getAllAuthors(req, res, next) {
  try {
    const result = await authorService.getAllAuthorsService();
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// GET /authors/:id
export async function getAuthorById(req, res, next) {
  try {
    const result = await authorService.getAuthorByIdService(req.params.id);
    if (!result) return res.status(404).json({ message: "Không tìm thấy tác giả" });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// POST /authors
export async function createAuthor(req, res, next) {
  try {
    const result = await authorService.createAuthorService(req.body);
    return res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

// PUT /authors/:id
export async function updateAuthor(req, res, next) {
  try {
    const result = await authorService.updateAuthorService(req.params.id, req.body);
    if (!result) return res.status(404).json({ message: "Không tìm thấy tác giả" });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// DELETE /authors/:id
export async function deleteAuthor(req, res, next) {
  try {
    const ok = await authorService.deleteAuthorService(req.params.id);
    if (!ok) return res.status(404).json({ message: "Không tìm thấy tác giả" });
    return res.status(204).send();
  } catch (e) {
    next(e);
  }
}
