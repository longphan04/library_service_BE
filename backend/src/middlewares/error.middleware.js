// file này chứa middleware xử lý lỗi

// trung gian cho toàn bộ ứng dụng Express
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || "Server error",
  });
}