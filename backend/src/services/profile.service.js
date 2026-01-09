import Profile from "../models/profile.model.js";
import User from "../models/user.model.js";
import Role from "../models/role.model.js";


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
export async function updateProfile({ user_id, ...data }) {
  const profile = await Profile.findOne({ where: { user_id } });
  if (!profile) throw appError("Profile không tồn tại", 404);

  const allowFields = ["full_name", "phone", "avatar_url", "address", "dob"];

  for (const field of allowFields) {
    if (data[field] !== undefined) profile[field] = data[field];
  }

  await profile.save();
  return { message: "Cập nhật profile thành công", data: profile };
}

// staff/admin xem profile + user info
export async function getProfileForStaff(userId) {
  return getProfileUserId(userId, { includeUser: true });
}


