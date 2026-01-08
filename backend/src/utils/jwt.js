// file này chứa các hàm JWT dùng chung

import jwt from "jsonwebtoken";

// Hàm tạo access token với payload tùy ý (payload là object)
export function signAccessToken(payload) {
  const secret = process.env.JWT_ACCESS_SECRET;
  const expiresIn = process.env.ACCESS_TOKEN_EXPIRES_IN || "15m";
  return jwt.sign(payload, secret, { expiresIn });
}
// Hàm xác minh access token
export function verifyAccessToken(token) {
  const secret = process.env.JWT_ACCESS_SECRET;
  return jwt.verify(token, secret);
}