import * as shelfService from "../services/master-data/shelf.service.js";

// GET /shelves
export async function getAllShelves(req, res, next) {
  try {
    const result = await shelfService.getAllShelvesService();
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// GET /shelves/:id
export async function getShelfById(req, res, next) {
  try {
    const result = await shelfService.getShelfByIdService(req.params.id);
    if (!result) return res.status(404).json({ message: "Không tìm thấy kệ" });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// POST /shelves
export async function createShelf(req, res, next) {
  try {
    const result = await shelfService.createShelfService(req.body);
    return res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

// PUT /shelves/:id
export async function updateShelf(req, res, next) {
  try {
    const result = await shelfService.updateShelfService(req.params.id, req.body);
    if (!result) return res.status(404).json({ message: "Không tìm thấy kệ" });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// DELETE /shelves/:id
export async function deleteShelf(req, res, next) {
  try {
    const ok = await shelfService.deleteShelfService(req.params.id);
    if (!ok) return res.status(404).json({ message: "Không tìm thấy kệ" });
    return res.status(204).send();
  } catch (e) {
    next(e);
  }
}
