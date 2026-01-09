import * as profileService from "../services/profile.service.js";

// GET /profile/me
export async function getMyProfile(req, res, next) {
  try {
    const userId = req.auth?.user_id;
    if (!userId) return res.status(401).json({ message: "Chưa đăng nhập" });

    const result = await profileService.getProfileUserId(userId);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}
// PUT /profile/me
export async function updateMyProfile(req, res, next) {
  try {
    const userId = req.auth?.user_id;
    if (!userId) return res.status(401).json({ message: "Chưa đăng nhập" });

    const result = await profileService.updateProfile({
      ...req.body,
      user_id: userId,
    });

    return res.json(result);
  } catch (err) {
    next(err);
  }
}
// GET /profile/user/:userId (staff/admin xem)
export async function getProfileByUserId(req, res, next) {
  try {
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ message: "Thiếu userId" });

    const result = await profileService.getProfileForStaff(userId);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}
