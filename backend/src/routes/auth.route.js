import { Router } from "express";
import { register, verifyEmail, resendVerifyEmail } from "../controllers/authRegister.controller.js";
import { login, refresh, logout } from "../controllers/authLog.controller.js";
import { forgotPassword, resetPassword, resetPasswordPage, changePassword } from "../controllers/authPass.controller.js";
import { requireAuthActive } from "../middlewares/auth.middleware.js";

const router = Router();

// Đăng ký người dùng mới
router.post("/register", register);
// Xác thực email người dùng mới
router.get("/verify-email", verifyEmail);
// Nhận lại email xác thực
router.post("/resend-verify-email", resendVerifyEmail);

// Đăng nhập, làm mới token, đăng xuất
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);


// Quên mật khẩu và đặt lại mật khẩu
router.post("/forgot-password", forgotPassword);
// Trang đặt lại mật khẩu khi người dùng click link trong email
router.get("/reset-password", resetPasswordPage);
// Đặt lại mật khẩu
router.post("/reset-password", resetPassword);

// Thay đổi mật khẩu (yêu cầu đăng nhập)
router.patch("/change-password", ...requireAuthActive, changePassword);

export default router;
