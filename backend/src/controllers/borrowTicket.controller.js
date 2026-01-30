import * as borrowTicketService from "../services/borrowTicket/index.service.js";

function getRolesFromAuth(auth) {
  const roles = auth?.roles;
  return Array.isArray(roles) ? roles : [];
}

// STAFF: GET /borrow-ticket
export async function getAllBorrowTickets(req, res, next) {
  try {
    const { status, page, limit } = req.query;
    const result = await borrowTicketService.getAllBorrowTicketsService({ status, page, limit });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// MEMBER: GET /borrow-ticket/me
export async function getMyBorrowTickets(req, res, next) {
  try {
    const memberId = req.auth?.user_id;
    const { status, page, limit } = req.query;

    const result = await borrowTicketService.getMyBorrowTicketsService(memberId, { status, page, limit });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// MEMBER: POST /borrow-ticket
export async function createBorrowTicket(req, res, next) {
  try {
    if ('memberId' in req.body) {
      return res.status(400).json({
        message: 'Không được truyền memberId'
      });
    }
    const memberId = req.auth.user_id;
    const created = await borrowTicketService.createBorrowTicketService({
      ...req.body,
      memberId,
    });

    return res.status(201).json(created);
  } catch (e) {
    next(e);
  }
}

// GET /borrow-ticket/:id
export async function getBorrowTicketById(req, res, next) {
  try {
    const requesterUserId = req.auth?.user_id;
    const requesterRoles = getRolesFromAuth(req.auth);

    const result = await borrowTicketService.getBorrowTicketByIdService({
      ticketId: req.params.id,
      requesterUserId,
      requesterRoles,
    });

    if (!result) return res.status(404).json({ message: "Không tìm thấy phiếu mượn" });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// MEMBER: PUT /borrow-ticket/:id/member
export async function updateBorrowTicketForMember(req, res, next) {
  try {
    const memberId = req.auth?.user_id;

    const result = await borrowTicketService.updateBorrowTicketForMemberService(
      req.params.id,
      memberId,
      req.body
    );

    if (!result) return res.status(404).json({ message: "Không tìm thấy phiếu mượn" });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// STAFF: PUT /borrow-ticket/:id/staff
export async function updateBorrowTicketForStaff(req, res, next) {
  try {
    const staffUserId = req.auth?.user_id;

    const result = await borrowTicketService.updateBorrowTicketForStaffService(
      req.params.id,
      staffUserId,
      req.body
    );

    if (!result) return res.status(404).json({ message: "Không tìm thấy phiếu mượn" });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// STAFF: GET /borrow-ticket/user/:userId
// Xem tất cả phiếu mượn của một user cụ thể
export async function getBorrowTicketsByUserId(req, res, next) {
  try {
    const { userId } = req.params;
    const { status, page, limit } = req.query;

    const result = await borrowTicketService.getBorrowTicketsByUserIdService(userId, { status, page, limit });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}