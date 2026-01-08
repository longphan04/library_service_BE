import bcrypt from "bcrypt";
import sequelize from "../config/dbConnection.js";

import User from "../models/user.model.js";
import RefreshToken from "../models/refreshToken.model.js";
import Role from "../models/role.model.js";

import { sha256, randomToken } from "../utils/crypto.js";
import { signAccessToken } from "../utils/jwt.js";

// Hàm tạo lỗi ứng dụng với message + status
function appError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}
// Tính ngày hết hạn cho refresh token
function refreshExpiresAt() {
  const days = Number(process.env.REFRESH_TOKEN_DAYS || 7);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// Đăng nhập
export async function loginService({ email, password, userAgent, ip }) {
  if (!email || !password) throw appError("Thiếu email/password", 400);

  const user = await User.scope("withPassword").findOne({
    where: { email },
    include: [{ model: Role, as: "roles", through: { attributes: [] } }],
  });

  if (!user) throw appError("Sai email hoặc mật khẩu", 401);
  if (user.status === "PENDING") throw appError("Email chưa xác nhận", 403);
  if (user.status === "BANNED") throw appError("Tài khoản đã bị khóa", 403);

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw appError("Sai email hoặc mật khẩu", 401);

  // access token
  const accessToken = signAccessToken({
    user_id: user.user_id,
    email: user.email,
  });

  // refresh token (raw + hash)
  const rawRefresh = randomToken(32);
  const token_hash = sha256(rawRefresh);

  await sequelize.transaction(async (t) => {
    await user.update({ last_login_at: new Date() }, { transaction: t });

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
  });

  return {
    accessToken,
    refreshToken: rawRefresh, // controller sẽ set cookie, không trả json
    user: {
      user_id: user.user_id,
      email: user.email,
      status: user.status,
      roles: (user.roles || []).map((r) => r.name),
    },
  };
}

// Làm mới access token
export async function refreshService({ rawRefreshToken, userAgent, ip }) {
  if (!rawRefreshToken) throw appError("Thiếu refresh token", 401);

  const token_hash = sha256(rawRefreshToken);

  return await sequelize.transaction(async (t) => {
    // lock row để tránh 2 request refresh cùng lúc
    const oldRow = await RefreshToken.findOne({
      where: { token_hash },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!oldRow) throw appError("Refresh token không hợp lệ", 401);

    // nếu đã revoke mà vẫn dùng lại => nghi ngờ bị leak
    if (oldRow.revoked_at) {
      // optional: revoke hết token của user để ép login lại
      await RefreshToken.update(
        { revoked_at: new Date() },
        { where: { user_id: oldRow.user_id, revoked_at: null }, transaction: t }
      );
      throw appError("Refresh token đã bị thu hồi, vui lòng đăng nhập lại", 401);
    }

    if (new Date(oldRow.expires_at) < new Date()) {
      await oldRow.update({ revoked_at: new Date() }, { transaction: t });
      throw appError("Refresh token hết hạn, vui lòng đăng nhập lại", 401);
    }

    const user = await User.findByPk(oldRow.user_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!user) throw appError("User không tồn tại", 404);
    if (user.status !== "ACTIVE") throw appError("Tài khoản không ACTIVE", 403);

    // rotate: revoke token cũ + tạo token mới
    await oldRow.update({ revoked_at: new Date() }, { transaction: t });

    const newRaw = randomToken(32);
    const newHash = sha256(newRaw);

    await RefreshToken.create(
      {
        user_id: user.user_id,
        token_hash: newHash,
        expires_at: refreshExpiresAt(),
        revoked_at: null,
        user_agent: userAgent || null,
        ip_address: ip || null,
      },
      { transaction: t }
    );

    const accessToken = signAccessToken({ user_id: user.user_id, email: user.email });

    return { accessToken, refreshToken: newRaw };
  });
}

// Đăng xuất
export async function logoutService({ rawRefreshToken }) {
  if (!rawRefreshToken) return { ok: true }; // vẫn clear cookie được

  const token_hash = sha256(rawRefreshToken);

  await RefreshToken.update(
    { revoked_at: new Date() },
    { where: { token_hash, revoked_at: null } }
  );

  return { ok: true };
}