import * as authService from "../services/auth-user/authLog.service.js";


// Thiết lập cookie lưu refresh token
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
// Xoá cookie refresh token
function clearRefreshCookie(res) {
  const name = process.env.COOKIE_NAME || "refresh_token";
  res.clearCookie(name, { path: "/" });
}
// Đăng nhập cho MEMBER
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const result = await authService.loginService({
      email,
      password,
      userAgent: req.get("user-agent"),
      ip: req.ip,
    });

    setRefreshCookie(res, result.refreshToken);

    return res.json({
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
}

// Đăng nhập cho ADMIN/STAFF
export async function loginStaff(req, res, next) {
  try {
    const { email, password } = req.body;

    const result = await authService.loginStaffService({
      email,
      password,
      userAgent: req.get("user-agent"),
      ip: req.ip,
    });

    setRefreshCookie(res, result.refreshToken);

    return res.json({
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
}
// Làm mới access token
export async function refresh(req, res, next) {
  try {
    const name = process.env.COOKIE_NAME || "refresh_token";
    const raw = req.cookies?.[name];

    const result = await authService.refreshService({
      rawRefreshToken: raw,
      userAgent: req.get("user-agent"),
      ip: req.ip,
    });

    setRefreshCookie(res, result.refreshToken);

    return res.json({ accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
}
// Đăng xuất
export async function logout(req, res, next) {
  try {
    const name = process.env.COOKIE_NAME || "refresh_token";
    const raw = req.cookies?.[name];

    await authService.logoutService({ rawRefreshToken: raw });

    clearRefreshCookie(res);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}