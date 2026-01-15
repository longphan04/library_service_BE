import express from "express";
import cors from "cors";
import path from "path";
import cookieParser from "cookie-parser";
import { errorHandler } from "./middlewares/error.middleware.js";
import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import profileRoutes from "./routes/profile.route.js";
import categoryRoutes from "./routes/category.route.js";
import bookRoutes from "./routes/book.route.js";
import bookCopiesRoutes from "./routes/bookCopy.route.js";
import shelfRoutes from "./routes/shelf.route.js";
import publisherRoutes from "./routes/publisher.route.js";
import authorRoutes from "./routes/author.route.js";
import bookHoldsRoutes from "./routes/bookHold.route.js";

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


// các route
app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/profile", profileRoutes);
app.use("/category", categoryRoutes);
app.use("/book", bookRoutes);
app.use("/book-copy", bookCopiesRoutes);
app.use("/shelf", shelfRoutes);
app.use("/publisher", publisherRoutes);
app.use("/author", authorRoutes);
app.use("/book-hold", bookHoldsRoutes);


// route ảnh tĩnh
app.use("/public", express.static(path.join(process.cwd(), "src", "public")));
// Lỗi trung gian
app.use(errorHandler);
export default app;
