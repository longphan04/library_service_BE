import * as userService from "../services/auth-user/user.service.js";

// GET /users/member (STAFF)
export async function getAllMembers(req, res, next) {
  try {
    const users = await userService.getAllMembersService({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
    });
    return res.json(users);
  } catch (e) {
    next(e);
  }
}

// GET /users/staff (ADMIN)
export async function getAllStaffs(req, res, next) {
  try {
    const users = await userService.getAllStaffsService({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
    });
    return res.json(users);
  } catch (e) {
    next(e);
  }
}

// PATCH /users/:userId (ADMIN)
export async function updateUserStatus(req, res, next) {
  try {
    const result = await userService.updateUserStatusService(req.params.userId, {
      status: req.body.status,
    });
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// DELETE /users/:userId (ADMIN)
export async function deleteUser(req, res, next) {
  try {
    const ok = await userService.deleteUserService(req.params.userId);
    if (!ok) return res.status(404).json({ message: "User không tồn tại" });
    return res.status(204).send();
  } catch (e) {
    next(e);
  }
}
