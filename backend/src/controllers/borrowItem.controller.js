import { updateBorrowItemStatusService } from "../services/borrowItem/borrowItem.put.service.js";

// STAFF: PUT /borrow-item/:id
export async function updateBorrowItemStatus(req, res, next) {
  try {
    const staffUserId = req.auth?.user_id;

    const result = await updateBorrowItemStatusService(req.params.id, staffUserId, req.body);
    if (!result) return res.status(404).json({ message: "Không tìm thấy borrow item" });

    return res.json(result);
  } catch (e) {
    next(e);
  }
}
