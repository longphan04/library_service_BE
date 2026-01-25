// Middleware xác thực đăng nhập và trạng thái user
import { verifyAccessToken } from "../utils/jwt.js";
import User from "../models/user.model.js";

// Route cần đăng nhập
export function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Thiếu access token" });

    const payload = verifyAccessToken(token); // { user_id, email, ... }
    req.auth = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ message: "Access token không hợp lệ hoặc hết hạn" });
  }
}

// Route optional đăng nhập (không bắt buộc, chỉ parse token nếu có)
// Dùng cho các route public nhưng cần biết user nếu đã đăng nhập (vd: log view)
export function optionalAuth(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (token) {
      const payload = verifyAccessToken(token);
      req.auth = payload;
    }
  } catch (e) {
    // Bỏ qua lỗi token, tiếp tục xử lý như anonymous
    req.auth = null;
  }
  return next();
}

// Route cần user ACTIVE
export async function requireActiveUser(req, res, next) {
  try {
    const userId = req.auth?.user_id;
    if (!userId) return res.status(401).json({ message: "Chưa đăng nhập" });

    const user = await User.findByPk(userId, { attributes: ["status"] });
    if (!user) return res.status(401).json({ message: "Tài khoản không tồn tại" });

    if (user.status !== "ACTIVE") {
      return res.status(403).json({ message: "Tài khoản đã bị khóa hoặc chưa kích hoạt" });
    }

    return next();
  } catch (e) {
    return next(e);
  }
}

// Combo
export const requireAuthActive = [requireAuth, requireActiveUser];
