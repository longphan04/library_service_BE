import { Router } from "express";
import { register, registerStaff, verifyEmail, resendVerifyEmail, registerMobile, verifyEmailOtp } from "../controllers/authRegister.controller.js";
import { login, loginStaff, refresh, logout } from "../controllers/authLog.controller.js";
import { forgotPassword, resetPassword, resetPasswordPage, changePassword } from "../controllers/authPass.controller.js";
import { requireAuthActive } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = Router();

// Đăng ký người dùng mới (WEB - gửi link)
router.post("/register", register);
// ADMIN tự đăng kí tài khoản cho STAFF
router.post("/register-staff", ...requireAuthActive, requireRole("ADMIN"), registerStaff);
// Xác thực email người dùng mới (WEB - click link)
router.get("/verify-email", verifyEmail);
// Nhận lại email xác thực (WEB)
router.post("/resend-verify-email", resendVerifyEmail);

// Đăng nhập cho MEMBER
router.post("/login", login);
// Đăng nhập cho ADMIN/STAFF
router.post("/login-staff", loginStaff);
// Làm mới token, đăng xuất (dùng chung cho cả 2)
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

// Đăng ký người dùng mới (MOBILE - gửi OTP)
router.post("/register-mobile", registerMobile);
// Xác nhận email (MOBILE - nhập OTP)
router.post("/verify-email-otp", verifyEmailOtp);

export default router;
