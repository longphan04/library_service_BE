import path from "path";
import * as passwordService from "../services/auth-user/authPass.service.js";



// Quên mật khẩu 
export async function forgotPassword(req, res, next) {
  try {
    const result = await passwordService.forgotPasswordService(req.body);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}
// Đặt lại mật khẩu
export async function resetPassword(req, res, next) {
  try {
    const result = await passwordService.resetPasswordService(req.body);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

// Trang đặt lại mật khẩu khi người dùng click link trong email
export function resetPasswordPage(req, res) {
  const filePath = path.resolve(process.cwd(), "src", "views", "reset-password.html");
  return res.sendFile(filePath);
}


// set refresh cookie (copy y hệt authLog.controller)
function setRefreshCookie(res, rawRefresh) {
  const name = process.env.COOKIE_NAME || "refresh_token";
  const days = Number(process.env.REFRESH_TOKEN_DAYS || 7);

  res.cookie(name, rawRefresh, {
    httpOnly: true,
    secure: String(process.env.COOKIE_SECURE) === "true",
    sameSite: process.env.COOKIE_SAMESITE || "lax",
    maxAge: days * 24 * 60 * 60 * 1000,
    path: "/",
  });
}
// Thay đổi mật khẩu (yêu cầu đăng nhập)
export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    const result = await passwordService.changePasswordService({
      userId: req.auth.user_id,
      currentPassword,
      newPassword,
      userAgent: req.get("user-agent"),
      ip: req.ip,
    });

    setRefreshCookie(res, result.refreshToken);

    return res.json({
      message: result.message,
      accessToken: result.accessToken,
    });
  } catch (err) {
    next(err);
  }
}