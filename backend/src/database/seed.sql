-- Seed data cho Library System
-- Chạy sau khi chạy migration.sql (đã tạo DB + tables).
USE library_db;

-- =========================
-- CATEGORIES (~10)
-- =========================
INSERT INTO categories (name, image) VALUES
  ('Tiểu thuyết', NULL),
  ('Khoa học', NULL),
  ('Kỹ năng sống', NULL),
  ('Thiếu nhi', NULL),
  ('Lịch sử', NULL),
  ('Tâm lý', NULL),
  ('Kinh doanh', NULL),
  ('Công nghệ thông tin', NULL),
  ('Ngoại ngữ', NULL),
  ('Văn học Việt Nam', NULL)
ON DUPLICATE KEY UPDATE
  image = VALUES(image);

-- =========================
-- PUBLISHERS (~10)
-- =========================
INSERT INTO publishers (name) VALUES
  ('NXB Trẻ'),
  ('NXB Kim Đồng'),
  ('NXB Lao Động'),
  ('NXB Văn Học'),
  ('NXB Tổng Hợp TP.HCM'),
  ('NXB Thế Giới'),
  ('NXB Giáo Dục Việt Nam'),
  ('NXB Chính Trị Quốc Gia Sự Thật'),
  ('NXB Thanh Niên'),
  ('O''Reilly Media')
ON DUPLICATE KEY UPDATE
  name = VALUES(name);

-- =========================
-- AUTHORS (~10)
-- =========================
INSERT INTO authors (name, bio) VALUES
  ('Nguyễn Nhật Ánh', 'Tác giả nổi tiếng với nhiều tác phẩm dành cho tuổi mới lớn.'),
  ('Haruki Murakami', 'Tiểu thuyết gia Nhật Bản, phong cách siêu thực.'),
  ('Yuval Noah Harari', 'Tác giả Sapiens, Homo Deus.'),
  ('Dale Carnegie', 'Tác giả Đắc nhân tâm.'),
  ('Paulo Coelho', 'Tác giả Nhà giả kim.'),
  ('J.K. Rowling', 'Tác giả bộ truyện Harry Potter.'),
  ('George Orwell', 'Tác giả 1984, Trại súc vật.'),
  ('Stephen Hawking', 'Nhà vật lý, tác giả Lược sử thời gian.'),
  ('Robert C. Martin', 'Tác giả Clean Code, kiến trúc phần mềm.'),
  ('Andrew S. Tanenbaum', 'Tác giả sách hệ điều hành, mạng máy tính.')
ON DUPLICATE KEY UPDATE
  bio = VALUES(bio);
