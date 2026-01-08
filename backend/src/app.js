import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.route.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import cookieParser from "cookie-parser";

const app = express();
// Lấy danh sách origin từ biến môi trường
const origins = (process.env.CLIENT_BASE_URL || "http://localhost:5173")
  .split(",")
  .map(s => s.trim());
// Cấu hình CORS
app.use(cors({
  origin: origins,
  credentials: true
}));
// Middleware để parse JSON và URL-encoded data (nếu cần)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Thêm cookie parser
app.use(cookieParser());

app.use("/auth", authRoutes);

// Lỗi trung gian
app.use(errorHandler);
export default app;
