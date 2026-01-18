import * as publisherService from "../services/master-data/publisher.service.js";

// GET /publishers
export async function getAllPublishers(req, res, next) {
  try {
    const result = await publisherService.getAllPublishersService();
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// GET /publishers/suggest?q=...
export async function suggestPublishers(req, res, next) {
  try {
    const keyword = req.query.q ?? req.query.keyword;
    const limit = req.query.limit;

    const result = await publisherService.suggestPublishersService({
      keyword,
      limit,
    });

    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// GET /publishers/:id
export async function getPublisherById(req, res, next) {
  try {
    const result = await publisherService.getPublisherByIdService(req.params.id);
    if (!result) return res.status(404).json({ message: "Không tìm thấy nhà xuất bản" });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// POST /publishers
export async function createPublisher(req, res, next) {
  try {
    const result = await publisherService.createPublisherService(req.body);
    return res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

// PUT /publishers/:id
export async function updatePublisher(req, res, next) {
  try {
    const result = await publisherService.updatePublisherService(req.params.id, req.body);
    if (!result) return res.status(404).json({ message: "Không tìm thấy nhà xuất bản" });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// DELETE /publishers/:id
export async function deletePublisher(req, res, next) {
  try {
    const ok = await publisherService.deletePublisherService(req.params.id);
    if (!ok) return res.status(404).json({ message: "Không tìm thấy nhà xuất bản" });
    return res.status(204).send();
  } catch (e) {
    next(e);
  }
}
