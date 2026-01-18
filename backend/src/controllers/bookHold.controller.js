import * as bookHoldService from "../services/book/bookHold.service.js";

// GET /book-hold/me
export async function getMyBookHolds(req, res, next) {
  try {
    const memberId = req.auth?.user_id;
    const result = await bookHoldService.getMyBookHoldsService(memberId);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// POST /book-hold
// body: { book_id }
export async function createBookHold(req, res, next) {
  try {
    const memberId = req.auth?.user_id;
    const bookId = req.body.book_id ?? req.body.bookId ?? req.body.id;

    const created = await bookHoldService.createBookHoldService({
      memberId,
      bookId,
    });

    return res.status(201).json(created);
  } catch (e) {
    next(e);
  }
}

// DELETE /book-hold
// body: { hold_ids: [1,2] } | { hold_id: 1 }
export async function deleteBookHolds(req, res, next) {
  try {
    const memberId = req.auth?.user_id;
    const holdIds = req.body.hold_ids ?? req.body.holdIds ?? req.body.hold_id ?? req.body.holdId;

    const result = await bookHoldService.deleteMyBookHoldsService({
      memberId,
      holdIds,
    });

    return res.json(result);
  } catch (e) {
    next(e);
  }
}
