import * as profileService from "../services/profile.service.js";

/* ========= PROFILE ========= */

// GET /profile/me
export async function getMyProfile(req, res, next) {
  try {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Thiếu Id"
      });
    }

    const result = await profileService.getProfileByUserId(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/users/profile


// PUT /api/users/profile
export async function updateProfile(req, res, next) {
  try {
    const userId = req.params.userId;
    const result = await profileService.updateProfile({
      ...req.body,
      user_id: userId,
      
    });
    
    res.json(result);
  } catch (err) {
    next(err);
  }
}

