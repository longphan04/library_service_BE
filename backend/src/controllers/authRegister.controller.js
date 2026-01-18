import path from "path";
import { fileURLToPath } from "url";
import * as authWebService from "../services/auth-user/authRegister.web.service.js";
import * as authAppService from "../services/auth-user/authRegister.app.service.js";



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const successPath = path.join(__dirname, "../views/verify-success.html");
const failPath = path.join(__dirname, "../views/verify-fail.html");

// =========================
// WEB (LINK)
// =========================

// Đăng ký người dùng mới
export async function register(req, res, next) {
  try {
    const result = await authWebService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// ADMIN tự đăng kí tài khoản cho STAFF
export async function registerStaff(req, res, next) {
  try {
    const result = await authWebService.registerStaff(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// Xác thực email người dùng mới (click link)
export async function verifyEmail(req, res, next) {
  try {
    const { token } = req.query;
    const result = await authWebService.verifyEmail(token);
    if (result.message === "Xác nhận email thành công. Tài khoản đã ACTIVE.") {
      return res.sendFile(successPath);
    }

    // fallback an toàn
    return res.sendFile(failPath);
  } catch (err) {
    return res.sendFile(failPath);
  }
}

// Nhận lại email xác thực
export async function resendVerifyEmail(req, res, next) {
  try {
    const result = await authWebService.resendVerifyEmail(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// =========================
// MOBILE (OTP)
// =========================

// MOBILE: Đăng ký bằng OTP
export async function registerMobile(req, res, next) {
  try {
    const result = await authAppService.registerMobile(req.body);
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// MOBILE: Xác nhận email bằng OTP
export async function verifyEmailOtp(req, res, next) {
  try {
    const result = await authAppService.verifyEmailOtp(req.body);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}
