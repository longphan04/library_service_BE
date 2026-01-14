// file này dùng để tạo lỗi ứng dụng với status code tùy ý

// sử dụng: throw appError("message", 404);
export function appError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}