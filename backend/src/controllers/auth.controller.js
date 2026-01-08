import path from "path";
import { fileURLToPath } from "url";
import * as authService from "../services/authRegister.service.js";




const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const successPath = path.join(__dirname, "../views/verify-success.html");
const failPath = path.join(__dirname, "../views/verify-fail.html");

// Đăng ký người dùng mới
export async function register(req, res, next) {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// Xác thực email người dùng mới
export async function verifyEmail(req, res, next) {
  try {
    const { token } = req.query;
    const result = await authService.verifyEmail(token);
    if (result.message === "Xác nhận email thành công. Tài khoản đã ACTIVE.") {
      return res.sendFile(successPath);
    }
  } catch (err) {
    return res.sendFile(failPath);
  }
}

// Nhận lại email xác thực từ người dùng
export async function resendVerifyEmail(req, res, next) {
  try {
    const result = await authService.resendVerifyEmail(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
