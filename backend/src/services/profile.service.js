// import User from "../models/user.model.js";
import Profile from "../models/profile.model.js";

/* ========= PROFILE ========= */

// GET profile by user_id
export async function getProfileByUserId(userId) {
  const profile = await Profile.findOne({
    where: { user_id: userId },
  });

  if (!profile) {
    throw {
      status: 404,
      message: "Profile không tồn tại",
    };
  }

  return profile;
}

// UPDATE profile
export async function updateProfile(data) {
  const profile = await Profile.findOne({
    where: { user_id: data.user_id },
  });

  if (!profile) {
    throw {
      status: 404,
      message: "Profile không tồn tại",
    };
  }

  const allowFields = [
    "full_name",
    "phone",
    "avatar_url",
    "address",
    "dob",
  ];

  allowFields.forEach((field) => {
    if (data[field] !== undefined) {
      profile[field] = data[field];
    }
  });

  await profile.save();

  return {
    message: "Cập nhật profile thành công",
    data: profile,
  };
}


