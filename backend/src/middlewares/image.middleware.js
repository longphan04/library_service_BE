import multer from "multer";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { v4 as uuidv4 } from "uuid";


const PUBLIC_ROOT = path.join(process.cwd(), "src", "public");
const TMP_DIR = path.join(PUBLIC_ROOT, "_tmp");

const ALLOW_DIR = {
  avatar: path.join(PUBLIC_ROOT, "avatar"),
  category: path.join(PUBLIC_ROOT, "category"),
  book: path.join(PUBLIC_ROOT, "book"),
};

function ensureDirs() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  Object.values(ALLOW_DIR).forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
}
ensureDirs();

function fileFilter(req, file, cb) {
  if (!file.mimetype?.startsWith("image/")) return cb(new Error("Chỉ cho phép upload ảnh (image/*)"));
  cb(null, true);
}

const tmpStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TMP_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${uuidv4()}${ext}`);
  },
});

export function createImageUpload({ maxSizeMB = 20 } = {}) {
  const upload = multer({
    storage: tmpStorage,
    fileFilter,
    limits: { fileSize: maxSizeMB * 1024 * 1024 },
  });
  return (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (err) {
        return next(err);
      }
      
      // Tự động xóa file tạm khi request kết thúc
      const cleanup = () => {
        if (req.file && req.file.path) {
          safeUnlink(req.file.path).catch(() => {
            // Bỏ qua lỗi nếu file đã bị xóa
          });
        }
      };
      
      res.on('finish', cleanup);
      res.on('close', cleanup);
      
      next();
    });
  };
}

// ===== helpers storage =====

function toRelPublicPath(type, filename) {
  // lưu trong DB dạng: "avatar/xxx.jpg" (không có src/public)
  return `${type}/${filename}`.replaceAll("\\", "/");
}

function absFromRel(relPath) {
  // relPath: "avatar/xxx.jpg"
  return path.join(PUBLIC_ROOT, relPath);
}

async function safeUnlink(absPath) {
  try {
    await fsp.unlink(absPath);
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
  }
}

async function moveFile(src, dest) {
  try {
    await fsp.rename(src, dest);
  } catch (e) {
    // fallback nếu rename khác ổ đĩa
    if (e?.code === "EXDEV") {
      await fsp.copyFile(src, dest);
      await safeUnlink(src);
    } else {
      throw e;
    }
  }
}

/**
 * Move ảnh từ _tmp sang folder thật, trả về relPath để lưu DB.
 * KHÔNG xóa ảnh cũ ở đây (xóa sau khi DB update ok).
 */
export async function saveUploadedImage({ file, type }) {
  if (!file) return null;
  const destDir = ALLOW_DIR[type];
  if (!destDir) throw new Error(`Invalid image type: ${type}`);

  const ext = path.extname(file.originalname || file.filename || "").toLowerCase() || ".jpg";
  const filename = `${uuidv4()}${ext}`;
  const destAbs = path.join(destDir, filename);

  await moveFile(file.path, destAbs);
  return toRelPublicPath(type, filename);
}

export async function deletePublicImage(relPath) {
  if (!relPath) return;
  // chặn path traversal
  const abs = absFromRel(relPath);
  if (!abs.startsWith(PUBLIC_ROOT)) throw new Error("Invalid path");
  await safeUnlink(abs);
}