import Profile from "../../models/profile.model.js";
import User from "../../models/user.model.js";
import Role from "../../models/role.model.js";
import { saveUploadedImage, deletePublicImage } from "../../middlewares/image.middleware.js";
import { appError } from "../../utils/appError.js";


// xem profile của chính mình và staff/admin xem profile người dùng khác
export async function getProfileUserId(userId, { includeUser = false } = {}) {
  const include = includeUser
    ? [
        {
          model: User,
          as: "user",
          attributes: ["user_id", "email", "status"],
          include: [
            {
              model: Role,
              as: "roles",
              attributes: ["name"],
              through: { attributes: [] },
            },
          ],
        },
      ]
    : [];

  const profile = await Profile.findOne({
    where: { user_id: userId },
    include,
  });

  if (!profile) throw appError("Profile không tồn tại", 404);
  return { data: profile };
}

// UPDATE profile (member tự sửa)
export async function updateProfile({ user_id, avatarFile, ...payload }) {
  const profile = await Profile.findOne({ where: { user_id } });
  if (!profile) throw appError("Profile không tồn tại", 404);
  // full name không được để trống
  if (payload.full_name !== undefined && payload.full_name.trim() === "") {
    throw appError("Họ và tên không được để trống", 400);
  }
  // chặn client tự set avatar_url bằng body
  delete payload.avatar_url;

  const oldAvatar = profile.avatar_url;
  let newAvatar = null;

  try {
    if (avatarFile) {
      newAvatar = await saveUploadedImage({ file: avatarFile, type: "avatar" });
    }

    await profile.update({
      ...payload,
      ...(newAvatar ? { avatar_url: newAvatar } : {}),
    });

    if (newAvatar && oldAvatar) {
      // optional an toàn hơn:
      // if (oldAvatar.startsWith("avatar/")) await deletePublicImage(oldAvatar);
      await deletePublicImage(oldAvatar);
    }

    return { data: profile };
  } catch (e) {
    if (newAvatar) await deletePublicImage(newAvatar);
    throw e;
  }
}

// staff/admin xem profile + user info
export async function getProfileForStaff(userId) {
  return getProfileUserId(userId, { includeUser: true });
}


