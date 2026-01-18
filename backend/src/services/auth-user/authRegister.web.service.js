// src/services/auth.service.js
import bcrypt from "bcrypt";
import crypto from "crypto";
import sequelize from "../../config/dbConnection.js";

import User from "../../models/user.model.js";
import Profile from "../../models/profile.model.js";
import Role from "../../models/role.model.js";
import UserRole from "../../models/userRole.model.js";
import AuthToken from "../../models/authToken.model.js";

// chỉnh path theo nơi bạn đặt file mail
import { sendVerifyEmail } from "../../utils/mailer.js";

// ===== config =====
const VERIFY_TTL_MIN = Number(process.env.VERIFY_TTL_MIN || 10); // token verify sống 10 phút
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function appError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Tạo token VERIFY_EMAIL mới:
 * - revoke (set used_at) tất cả token VERIFY_EMAIL chưa dùng của user
 * - tạo row token_hash + expires_at
 * - trả về rawToken để gửi mail
 */
async function issueVerifyEmailToken(userId, t) {
  // hủy token verify cũ (nếu có)
  await AuthToken.update(
    { used_at: new Date() },
    {
      where: {
        user_id: userId,
        purpose: "VERIFY_EMAIL",
        used_at: null,
      },
      transaction: t,
    }
  );

  const rawToken = crypto.randomBytes(32).toString("hex");
  const token_hash = sha256(rawToken);

  await AuthToken.create(
    {
      user_id: userId,
      purpose: "VERIFY_EMAIL",
      token_hash,
      expires_at: new Date(Date.now() + VERIFY_TTL_MIN * 60 * 1000),
      used_at: null,
    },
    { transaction: t }
  );

  return rawToken;
}

/**
 * REGISTER (WEB - link verify):
 * - email unique
 * - tạo user status=PENDING
 * - tạo profile
 * - gán role MEMBER
 * - tạo token verify + gửi mail link
 *
 * Nếu email đã tồn tại:
 * - ACTIVE/BANNED => báo trùng
 * - PENDING => gửi lại link verify (không tạo user mới)
 */
export async function register({ email, password, full_name }) {
  if (!email || !password || !full_name) {
    throw appError("Thiếu email/password/full_name", 400);
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  // check trước cho rõ ràng
  const existed = await User.findOne({ where: { email: normalizedEmail } });

  // Nếu đã tồn tại
  if (existed) {
    if (existed.status === "ACTIVE") throw appError("Email đã tồn tại", 409);
    if (existed.status === "BANNED") throw appError("Tài khoản đang bị khóa", 403);

    // PENDING => tạo token mới trong transaction, COMMIT xong trả response ngay,
    // gửi email verify bất đồng bộ (tránh chậm request).
    const { rawToken, profileName } = await sequelize.transaction(async (t) => {
      const password_hash = await bcrypt.hash(String(password), SALT_ROUNDS);
      await existed.update({ password_hash }, { transaction: t });

      await Profile.upsert({ user_id: existed.user_id, full_name }, { transaction: t });

      const token = await issueVerifyEmailToken(existed.user_id, t);
      return { rawToken: token, profileName: full_name };
    });

    // fire-and-forget
    sendVerifyEmail({
      to: normalizedEmail,
      token: rawToken,
      fullName: profileName,
    }).catch((err) => {
      console.error("Send verify email failed (PENDING resend):", err);
    });

    return {
      message: `Tài khoản đang chờ xác nhận. Đã tạo lại link xác nhận (hết hạn ${VERIFY_TTL_MIN} phút).`,
    };
  }

  // Tạo mới
  const password_hash = await bcrypt.hash(String(password), SALT_ROUNDS);

  // Tạo data trong transaction; COMMIT xong trả response ngay; email gửi async
  const { userId, rawToken } = await sequelize.transaction(async (t) => {
    const user = await User.create(
      {
        email: normalizedEmail,
        password_hash,
        status: "PENDING",
      },
      { transaction: t }
    );

    await Profile.create(
      {
        user_id: user.user_id,
        full_name,
      },
      { transaction: t }
    );

    // gán role MEMBER
    const memberRole = await Role.findOne({
      where: { name: "MEMBER" },
      transaction: t,
    });
    if (memberRole) {
      await UserRole.create({ user_id: user.user_id, role_id: memberRole.role_id }, { transaction: t });
    }

    const token = await issueVerifyEmailToken(user.user_id, t);
    return { userId: user.user_id, rawToken: token };
  });

  // fire-and-forget
  sendVerifyEmail({ to: normalizedEmail, token: rawToken, fullName: full_name }).catch((err) => {
    console.error("Send verify email failed (REGISTER):", err);
  });

  return {
    message: `Đăng ký thành công ở trạng thái chờ xác nhận. Vui lòng kiểm tra email (hết hạn ${VERIFY_TTL_MIN} phút).`,
    user_id: userId,
  };
}

// ------------------------------------------------------------------------
// ADMIN tự đăng kí tài khoản cho STAFF
export async function registerStaff({ email, password, full_name }) {
  if (!email || !password || !full_name) {
    throw appError("Thiếu email/password/full_name", 400);
  }
  const normalizedEmail = String(email).toLowerCase().trim();

  // check trước cho rõ ràng
  const existed = await User.findOne({ where: { email: normalizedEmail } });
  if (existed) {
    throw appError("Email đã tồn tại", 409);
  }
  const password_hash = await bcrypt.hash(String(password), SALT_ROUNDS);

  // Tạo mới
  const userId = await sequelize.transaction(async (t) => {
    const user = await User.create(
      {
        email: normalizedEmail,
        password_hash,
        status: "ACTIVE",
      },
      { transaction: t }
    );

    await Profile.create(
      {
        user_id: user.user_id,
        full_name,
      },
      { transaction: t }
    );

    // gán role STAFF
    const staffRole = await Role.findOne({
      where: { name: "STAFF" },
      transaction: t,
    });
    if (staffRole) {
      await UserRole.create({ user_id: user.user_id, role_id: staffRole.role_id }, { transaction: t });
    }

    return user.user_id;
  });

  return {
    message: "Đăng ký thành công.",
    user_id: userId,
  };
}

/**
 * VERIFY EMAIL (WEB - click link):
 * - tìm token_hash purpose VERIFY_EMAIL chưa dùng
 * - check expires
 * - set user ACTIVE
 * - set token used_at
 */
export async function verifyEmail(rawToken) {
  if (!rawToken) throw appError("Thiếu token", 400);

  const token_hash = sha256(rawToken);

  return await sequelize.transaction(async (t) => {
    const tokenRow = await AuthToken.findOne({
      where: {
        token_hash,
        purpose: "VERIFY_EMAIL",
        used_at: null,
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!tokenRow) throw appError("Token không hợp lệ hoặc đã dùng", 400);
    if (new Date(tokenRow.expires_at) < new Date()) {
      throw appError("Token đã hết hạn, vui lòng gửi lại link", 400);
    }

    const user = await User.findByPk(tokenRow.user_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!user) throw appError("User không tồn tại", 404);

    // kích hoạt
    if (user.status !== "ACTIVE") {
      await user.update({ status: "ACTIVE" }, { transaction: t });
    }

    await tokenRow.update({ used_at: new Date() }, { transaction: t });

    return { message: "Xác nhận email thành công. Tài khoản đã ACTIVE." };
  });
}

/**
 * RESEND VERIFY (WEB):
 * - user phải tồn tại
 * - nếu ACTIVE => báo đã xác nhận
 * - nếu PENDING => tạo token mới + gửi mail link
 */
export async function resendVerifyEmail({ email }) {
  if (!email) throw appError("Thiếu email", 400);

  const normalizedEmail = String(email).toLowerCase().trim();
  const user = await User.findOne({
    where: { email: normalizedEmail },
    include: [{ model: Profile, as: "profile" }],
  });

  if (!user) throw appError("Email không tồn tại", 404);
  if (user.status === "ACTIVE") return { message: "Email đã tồn tại." };

  const rawToken = await sequelize.transaction(async (t) => {
    return await issueVerifyEmailToken(user.user_id, t);
  });

  await sendVerifyEmail({
    to: normalizedEmail,
    token: rawToken,
    fullName: user.profile?.full_name || "",
  });

  return { message: `Đã gửi lại link xác nhận (hết hạn ${VERIFY_TTL_MIN} phút).` };
}
