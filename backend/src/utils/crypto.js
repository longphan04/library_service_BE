// file này chứa các hàm crypto dùng chung

import crypto from "crypto";

// Hàm băm SHA-256 dùng cho token (cũng có thể dùng cho mật khẩu)
export function sha256(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}
// Hàm tạo token ngẫu nhiên dạng hex dài bytes*2 ký tự (trong đó mỗi byte = 2 ký tự hex)
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex"); // raw token gửi về cookie
}