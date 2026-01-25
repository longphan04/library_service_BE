import bcrypt from "bcrypt";
import User from "../models/user.model.js";
import Role from "../models/role.model.js";
import Profile from "../models/profile.model.js";
import UserRole from "../models/userRole.model.js";
import sequelize from "../config/dbConnection.js";

// Số vòng hash bcrypt (lấy từ env hoặc mặc định 10)
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

/**
 * Tự động tạo tài khoản Admin nếu chưa tồn tại trong DB.
 * - Kiểm tra theo email từ biến môi trường ADMIN_EMAIL
 * - Nếu chưa có → tạo user, profile, gán role ADMIN
 * - Nếu đã có → bỏ qua, chỉ log thông báo
 */
export async function initAdminAccount() {
  // Lấy thông tin admin từ biến môi trường
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminFullName = process.env.ADMIN_FULL_NAME || "Quản trị viên";

  // Nếu không cấu hình email/password trong env → bỏ qua
  if (!adminEmail || !adminPassword) {
    console.log("[init] Không tìm thấy ADMIN_EMAIL hoặc ADMIN_PASSWORD trong .env, bỏ qua tạo admin.");
    return;
  }

  try {
    // Kiểm tra xem admin đã tồn tại chưa (theo email)
    const existingUser = await User.findOne({
      where: { email: adminEmail },
    });

    if (existingUser) {
      console.log(`[init] Tài khoản admin (${adminEmail}) đã tồn tại, bỏ qua.`);
      return;
    }

    // Lấy role ADMIN từ DB
    let adminRole = await Role.findOne({ where: { name: "ADMIN" } });

    // Nếu chưa có role ADMIN → tạo mới (trường hợp DB mới hoàn toàn)
    if (!adminRole) {
      adminRole = await Role.create({
        name: "ADMIN",
        description: "Quản trị viên hệ thống",
      });
      console.log("[init] Đã tạo role ADMIN.");
    }

    // Tạo admin trong transaction để đảm bảo tính toàn vẹn dữ liệu
    const t = await sequelize.transaction();
    try {
      // Hash mật khẩu
      const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);

      // Tạo user
      const newUser = await User.create(
        {
          email: adminEmail,
          password_hash: passwordHash,
          status: "ACTIVE",
        },
        { transaction: t }
      );

      // Tạo profile
      await Profile.create(
        {
          user_id: newUser.user_id,
          full_name: adminFullName,
        },
        { transaction: t }
      );

      // Gán role ADMIN cho user
      await UserRole.create(
        {
          user_id: newUser.user_id,
          role_id: adminRole.role_id,
        },
        { transaction: t }
      );

      await t.commit();
      console.log(`[init] Đã tạo tài khoản admin: ${adminEmail}`);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (error) {
    console.error("[init] Lỗi khi tạo tài khoản admin:", error?.message || error);
    // Không throw để server vẫn chạy được, chỉ log lỗi
  }
}
