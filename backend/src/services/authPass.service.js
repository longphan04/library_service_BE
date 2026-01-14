import bcrypt from "bcrypt";
import sequelize from "../config/dbConnection.js";

import User from "../models/user.model.js";
import Profile from "../models/profile.model.js";
import AuthToken from "../models/authToken.model.js";
import RefreshToken from "../models/refreshToken.model.js";

import { sha256, randomToken } from "../utils/crypto.js";
import { sendResetPasswordEmail } from "../utils/mailer.js";
import { signAccessToken } from "../utils/jwt.js";

const RESET_TTL_MIN = Number(process.env.RESET_TTL_MIN || 10);
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

function appError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function issueResetPasswordToken(userId, t) {
  // hủy các token reset cũ chưa dùng
  await AuthToken.update(
    { used_at: new Date() },
    {
      where: { user_id: userId, purpose: "RESET_PASSWORD", used_at: null },
      transaction: t,
    }
  );

  const rawToken = randomToken(32);
  const token_hash = sha256(rawToken);

  await AuthToken.create(
    {
      user_id: userId,
      purpose: "RESET_PASSWORD",
      token_hash,
      expires_at: new Date(Date.now() + RESET_TTL_MIN * 60 * 1000),
      used_at: null,
    },
    { transaction: t }
  );

  return rawToken;
}

// POST /auth/forgot-password
export async function forgotPasswordService({ email }) {
  if (!email) throw appError("Thiếu email", 400);

  const normalizedEmail = String(email).toLowerCase().trim();

  // tránh lộ email tồn tại hay không: luôn trả message giống nhau
  const safeResponse = {
    message:
      "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. Vui lòng kiểm tra inbox/spam.",
  };

  const user = await User.findOne({
    where: { email: normalizedEmail },
    include: [{ model: Profile, as: "profile" }],
  });

  // email không tồn tại => vẫn trả ok
  if (!user) return safeResponse;

  // BANNED => không cho reset (vẫn trả ok để tránh lộ)
  if (user.status === "BANNED") return safeResponse;
 // PENDING => không cho reset (vẫn trả ok để tránh lộ)
  if (user.status === "PENDING") return safeResponse;
  const rawToken = await sequelize.transaction(async (t) => {
    return await issueResetPasswordToken(user.user_id, t);
  });

  // gửi mail sau commit
  await sendResetPasswordEmail({
    to: normalizedEmail,
    token: rawToken,
    fullName: user.profile?.full_name || "",
  });

  return safeResponse;
}

// POST /auth/reset-password
export async function resetPasswordService({ token, newPassword }) {
  if (!token) throw appError("Thiếu token", 400);
  if (!newPassword) throw appError("Thiếu newPassword", 400);

  const pwd = String(newPassword);
  if (pwd.length < 8) throw appError("Mật khẩu phải tối thiểu 8 ký tự", 400);

  const token_hash = sha256(token);

  return await sequelize.transaction(async (t) => {
    const tokenRow = await AuthToken.findOne({
      where: {
        token_hash,
        purpose: "RESET_PASSWORD",
        used_at: null,
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!tokenRow) throw appError("Token không hợp lệ hoặc đã dùng", 400);

    if (new Date(tokenRow.expires_at) < new Date()) {
      // chặn reuse token hết hạn
      await tokenRow.update({ used_at: new Date() }, { transaction: t });
      throw appError("Token đã hết hạn, vui lòng yêu cầu lại", 400);
    }

    const user = await User.findByPk(tokenRow.user_id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!user) throw appError("User không tồn tại", 404);
    if (user.status === "BANNED") throw appError("Tài khoản đã bị khóa", 403);
    if (user.status === "PENDING") throw appError("Tài khoản chưa được kích hoạt", 403);
    const password_hash = await bcrypt.hash(pwd, SALT_ROUNDS);

    await user.update({ password_hash }, { transaction: t });

    // đánh dấu token đã dùng
    await tokenRow.update({ used_at: new Date() }, { transaction: t });

    // khuyến nghị: revoke toàn bộ refresh token để ép đăng nhập lại mọi thiết bị
    await RefreshToken.update(
      { revoked_at: new Date() },
      { where: { user_id: user.user_id, revoked_at: null }, transaction: t }
    );

    return { message: "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại." };
  });
}


// Tính ngày hết hạn cho refresh token
function refreshExpiresAt() {
  const days = Number(process.env.REFRESH_TOKEN_DAYS || 7);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// Đổi mật khẩu (yêu cầu đăng nhập)
// PATCH /auth/change-password (yêu cầu đăng nhập)
export async function changePasswordService({ userId, currentPassword, newPassword, userAgent, ip }) {
  if (!userId) throw appError("Chưa đăng nhập", 401);
  if (!currentPassword) throw appError("Thiếu currentPassword", 400);
  if (!newPassword) throw appError("Thiếu newPassword", 400);

  const cur = String(currentPassword);
  const pwd = String(newPassword);

  if (pwd.length < 8) throw appError("Mật khẩu mới tối thiểu 8 ký tự", 400);
  if (pwd === cur) throw appError("Mật khẩu mới không được trùng mật khẩu cũ", 400);

  return await sequelize.transaction(async (t) => {
    // lấy password_hash chắc chắn (tránh defaultScope ẩn)
    const user = await User.scope("withPassword").findByPk(userId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!user) throw appError("User không tồn tại", 404);

    // route đang dùng requireAuthActive rồi, nhưng để chắc
    if (user.status !== "ACTIVE") throw appError("Tài khoản không ACTIVE", 403);

    const ok = await bcrypt.compare(cur, user.password_hash);
    if (!ok) throw appError("Mật khẩu hiện tại không đúng", 401);

    const password_hash = await bcrypt.hash(pwd, SALT_ROUNDS);
    await user.update({ password_hash }, { transaction: t });

    // revoke toàn bộ refresh token (đá các thiết bị khác)
    await RefreshToken.update(
      { revoked_at: new Date() },
      { where: { user_id: user.user_id, revoked_at: null }, transaction: t }
    );

    // cấp refresh token mới cho phiên hiện tại
    const rawRefresh = randomToken(32);
    const token_hash = sha256(rawRefresh);

    await RefreshToken.create(
      {
        user_id: user.user_id,
        token_hash,
        expires_at: refreshExpiresAt(),
        revoked_at: null,
        user_agent: userAgent || null,
        ip_address: ip || null,
      },
      { transaction: t }
    );

    // cấp access token mới (FE update token)
    const accessToken = signAccessToken({ user_id: user.user_id, email: user.email });

    return {
      message: "Đổi mật khẩu thành công",
      accessToken,
      refreshToken: rawRefresh,
    };
  });
}
