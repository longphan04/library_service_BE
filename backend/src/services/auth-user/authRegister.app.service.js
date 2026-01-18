import bcrypt from "bcrypt";
import crypto from "crypto";
import sequelize from "../../config/dbConnection.js";

import User from "../../models/user.model.js";
import Profile from "../../models/profile.model.js";
import Role from "../../models/role.model.js";
import UserRole from "../../models/userRole.model.js";
import AuthToken from "../../models/authToken.model.js";

import { sendVerifyOtpEmail } from "../../utils/mailer.js";

// ===== config =====
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
const VERIFY_OTP_TTL_MIN = Number(process.env.VERIFY_OTP_TTL_MIN || 5);
const VERIFY_OTP_MAX_FAILS = Number(process.env.VERIFY_OTP_MAX_FAILS || 5);

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function appError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function generateOtp6() {
  // OTP 6 số, có thể bắt đầu bằng 0
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

async function issueVerifyEmailOtpToken(userId, t) {
  // Hủy các OTP cũ chưa dùng của user (nếu có) để tránh spam + tránh nhiều OTP cùng lúc
  await AuthToken.update(
    { used_at: new Date() },
    {
      where: {
        user_id: userId,
        purpose: "VERIFY_EMAIL_OTP",
        used_at: null,
      },
      transaction: t,
    }
  );

  const otp = generateOtp6();
  const token_hash = sha256(otp);

  await AuthToken.create(
    {
      user_id: userId,
      purpose: "VERIFY_EMAIL_OTP",
      token_hash,
      expires_at: new Date(Date.now() + VERIFY_OTP_TTL_MIN * 60 * 1000),
      used_at: null,
      otp_fail_count: 0,
    },
    { transaction: t }
  );

  // trả OTP raw để gửi email (không lưu plain text)
  return otp;
}

/**
 * REGISTER (MOBILE APP - OTP):
 * - Tạo user status=PENDING (coi như email_verified=false)
 * - Sinh OTP 6 số (hash lưu vào auth_tokens)
 * - OTP hết hạn 5 phút, dùng 1 lần
 */
export async function registerMobile({ email, password, full_name }) {
  if (!email || !password || !full_name) {
    throw appError("Thiếu email/password/full_name", 400);
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  const existed = await User.findOne({ where: { email: normalizedEmail } });

  if (existed) {
    if (existed.status === "ACTIVE") throw appError("Email đã tồn tại", 409);
    if (existed.status === "BANNED") throw appError("Tài khoản đang bị khóa", 403);

    // PENDING => cập nhật mật khẩu + gửi lại OTP (không tạo user mới)
    const { otp, profileName } = await sequelize.transaction(async (t) => {
      const password_hash = await bcrypt.hash(String(password), SALT_ROUNDS);
      await existed.update({ password_hash }, { transaction: t });

      await Profile.upsert({ user_id: existed.user_id, full_name }, { transaction: t });

      const rawOtp = await issueVerifyEmailOtpToken(existed.user_id, t);
      return { otp: rawOtp, profileName: full_name };
    });

    // fire-and-forget
    sendVerifyOtpEmail({ to: normalizedEmail, otp, fullName: profileName }).catch((err) => {
      console.error("Send verify OTP email failed (PENDING resend):", err);
    });

    return {
      message: `Tài khoản đang chờ xác nhận. Đã gửi lại mã OTP (hết hạn ${VERIFY_OTP_TTL_MIN} phút).`,
    };
  }

  const password_hash = await bcrypt.hash(String(password), SALT_ROUNDS);

  const { userId, otp } = await sequelize.transaction(async (t) => {
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

    const memberRole = await Role.findOne({ where: { name: "MEMBER" }, transaction: t });
    if (memberRole) {
      await UserRole.create({ user_id: user.user_id, role_id: memberRole.role_id }, { transaction: t });
    }

    const rawOtp = await issueVerifyEmailOtpToken(user.user_id, t);

    return { userId: user.user_id, otp: rawOtp };
  });

  // fire-and-forget
  sendVerifyOtpEmail({ to: normalizedEmail, otp, fullName: full_name }).catch((err) => {
    console.error("Send verify OTP email failed (REGISTER MOBILE):", err);
  });

  return {
    message: `Đăng ký thành công ở trạng thái chờ xác nhận. Vui lòng kiểm tra email để lấy mã OTP (hết hạn ${VERIFY_OTP_TTL_MIN} phút).`,
    user_id: userId,
  };
}

/**
 * VERIFY EMAIL (MOBILE APP - OTP):
 * - Nhận { email, otp }
 * - OTP đúng + còn hạn + chưa dùng => set user ACTIVE
 * - Đánh dấu OTP used_at
 */
export async function verifyEmailOtp({ email, otp }) {
  if (!email) throw appError("Thiếu email", 400);
  if (!otp) throw appError("Thiếu otp", 400);

  const normalizedEmail = String(email).toLowerCase().trim();
  const rawOtp = String(otp).trim();

  if (!/^[0-9]{6}$/.test(rawOtp)) {
    throw appError("OTP không hợp lệ", 400);
  }

  const user = await User.findOne({ where: { email: normalizedEmail } });
  if (!user) throw appError("Tài khoản không tồn tại", 404);

  // idempotent
  if (user.status === "ACTIVE") {
    return { message: "Email đã được xác nhận trước đó." };
  }

  if (user.status === "BANNED") throw appError("Tài khoản đang bị khóa", 403);

  const token_hash = sha256(rawOtp);

  return await sequelize.transaction(async (t) => {
    // Lấy OTP mới nhất còn hiệu lực (row đã lock để tránh verify đồng thời)
    const tokenRow = await AuthToken.findOne({
      where: {
        user_id: user.user_id,
        purpose: "VERIFY_EMAIL_OTP",
        used_at: null,
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!tokenRow) throw appError("OTP không hợp lệ hoặc đã dùng", 400);

    // hết hạn
    if (new Date(tokenRow.expires_at) < new Date()) {
      await tokenRow.update({ used_at: new Date() }, { transaction: t });
      throw appError("OTP đã hết hạn, vui lòng gửi lại OTP", 400);
    }

    const failCount = Number(tokenRow.otp_fail_count || 0);
    if (failCount >= VERIFY_OTP_MAX_FAILS) {
      await tokenRow.update({ used_at: new Date() }, { transaction: t });
      throw appError("Bạn đã nhập sai OTP quá nhiều lần. Vui lòng gửi lại OTP", 429);
    }

    if (tokenRow.token_hash !== token_hash) {
      await tokenRow.update({ otp_fail_count: failCount + 1 }, { transaction: t });
      throw appError("OTP không đúng", 400);
    }

    await user.update({ status: "ACTIVE" }, { transaction: t });
    await tokenRow.update({ used_at: new Date() }, { transaction: t });

    return { message: "Xác nhận email thành công. Tài khoản đã ACTIVE." };
  });
}
