import { Router } from "express";
import { register, verifyEmail, resendVerifyEmail } from "../controllers/auth.controller.js";

const router = Router();

// Đăng ký người dùng mới
router.post("/register", register);

// Xác thực email người dùng mới
router.get("/verify-email", verifyEmail);
// Nhận lại email xác thực từ người dùng
router.post("/resend-verify-email", resendVerifyEmail);

export default router;
