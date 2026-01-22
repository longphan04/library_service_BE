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
// Xử lý response phù hợp với logic mới:
// - Nếu staff có lịch sử làm việc => chuyển BANNED, trả về thông tin chi tiết
// - Nếu không có lịch sử => xóa hoàn toàn, trả 204
export async function deleteUser(req, res, next) {
  try {
    const result = await userService.deleteUserService(req.params.userId);
    
    // Trường hợp user không tồn tại
    if (result.reason === "User không tồn tại") {
      return res.status(404).json({ message: result.reason });
    }
    
    // Trường hợp staff có lịch sử làm việc => đã chuyển BANNED
    if (result.banned) {
      return res.status(200).json({
        message: result.reason,
        data: result.history,
      });
    }
    
    // Trường hợp xóa thành công hoàn toàn
    return res.status(200).json({ message: result.reason });
  } catch (e) {
    next(e);
  }
}
