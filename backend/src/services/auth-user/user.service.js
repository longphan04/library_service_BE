import User from "../../models/user.model.js";
import Profile from "../../models/profile.model.js";
import Role from "../../models/role.model.js";
import { Op, col, where as sqlWhere } from "sequelize";
import { appError } from "../../utils/appError.js";

// Chuẩn hoá status input
function normalizeStatus(status) {
  if (!status) return null;
  return String(status).trim().toUpperCase();
}
// Lấy role_id từ tên role, hoặc throw lỗi nếu không tồn tại
async function mustGetRoleIdByName(roleName) {
  const role = await Role.findOne({ where: { name: roleName } });
  if (!role) throw appError(`Role ${roleName} không tồn tại`, 500);
  return role.role_id;
}
// Xây dựng include chung cho User (profile + roles)
function buildUserInclude(roleName) {
  const base = [
    { model: Profile, as: "profile" },
    {
      model: Role,
      as: "roles",
      attributes: ["name"],
      through: { attributes: [] },
    },
  ];

  // Khi cần filter theo role (MEMBER/STAFF)
  if (roleName) {
    base[1] = {
      ...base[1],
      where: { name: roleName },
      required: true,
    };
  }

  return base;
}

function parsePaging({ page = 1, limit = 10 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  return { safeLimit, safePage, offset: (safePage - 1) * safeLimit };
}

// Lấy tất cả member ( yêu cầu  input từ client: page, limit, search? ), không trả về user pendding
export async function getAllMembersService({ page, limit, search } = {}) {
  const { safeLimit, safePage, offset } = parsePaging({ page, limit });

  const q = String(search ?? "").trim();
  const where = {
  status: { [Op.ne]: "PENDING" },
  ...(q
    ? {
        [Op.and]: [
          sqlWhere(col("profile.full_name"), {
            [Op.like]: `%${q}%`,
          }),
        ],
      }
    : {}),
  };

  const { count, rows } = await User.findAndCountAll({
    where,
    // chỉ trả về các field cần cho UI
    attributes: ["user_id", "email", "status"],
    include: [
      {
        model: Profile,
        as: "profile",
        attributes: ["full_name"],
        required: true,
      },
      {
        // vẫn filter theo role MEMBER nhưng không trả dữ liệu role
        model: Role,
        as: "roles",
        attributes: [],
        through: { attributes: [] },
        where: { name: "MEMBER" },
        required: true,
      },
    ],
    distinct: true,
    order: [["user_id", "DESC"]],
    limit: safeLimit,
    offset,
  });

  return {
    data: rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalItems: count,
      totalPages: Math.ceil(count / safeLimit) || 1,
      hasNext: offset + rows.length < count,
    },
  };
}

// Lấy tất cả staff
export async function getAllStaffsService({ page, limit, search } = {}) {
  const { safeLimit, safePage, offset } = parsePaging({ page, limit });

  const q = String(search ?? "").trim();
  const where = {
  status: { [Op.ne]: "PENDING" },
  ...(q
    ? {
        [Op.and]: [
          sqlWhere(col("profile.full_name"), {
            [Op.like]: `%${q}%`,
          }),
        ],
      }
    : {}),
  };

  const { count, rows } = await User.findAndCountAll({
    where,
    attributes: ["user_id", "email", "status"],
    include: [
      {
        model: Profile,
        as: "profile",
        attributes: ["full_name"],
        required: true,
      },
      {
        model: Role,
        as: "roles",
        attributes: [],
        through: { attributes: [] },
        where: { name: "STAFF" },
        required: true,
      },
    ],
    distinct: true,
    order: [["user_id", "DESC"]],
    limit: safeLimit,
    offset,
  });

  return {
    data: rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalItems: count,
      totalPages: Math.ceil(count / safeLimit) || 1,
      hasNext: offset + rows.length < count,
    },
  };
}

// Cập nhật trạng thái user (ACTIVE/BANNED)
export async function updateUserStatusService(userId, { status }) {
  const s = normalizeStatus(status);
  if (!s) throw appError("Thiếu status", 400);

  // DB users.status hiện là ENUM('ACTIVE','BANNED') ở model
  if (!['ACTIVE', 'BANNED'].includes(s)) {
    throw appError("status chỉ nhận ACTIVE hoặc BANNED", 400);
  }

  const user = await User.scope("withPassword").findByPk(userId);
  if (!user) throw appError("User không tồn tại", 404);

  await user.update({ status: s });

  // trả về kèm profile + roles (không trả password_hash vì defaultScope exclude)
  const fresh = await User.findByPk(userId, { include: buildUserInclude() });
  return fresh;
}

// Xoá user
// Giải pháp cho staff có lịch sử làm việc:
// - Kiểm tra xem staff có liên kết với các bảng khác không (books, borrow_tickets)
// - Nếu có lịch sử làm việc => chuyển status thành BANNED thay vì xóa
// - Nếu không có lịch sử => xóa hoàn toàn
export async function deleteUserService(userId) {
  const user = await User.findByPk(userId);
  if (!user) return { deleted: false, reason: "User không tồn tại" };

  // Kiểm tra role của user
  const userWithRoles = await User.findByPk(userId, {
    include: [{ model: Role, as: "roles", attributes: ["name"], through: { attributes: [] } }],
  });

  const roles = (userWithRoles?.roles || []).map((r) => r.name);
  
  // Không cho xoá ADMIN để tránh "mất hệ thống"
  if (roles.includes("ADMIN")) {
    throw appError("Không thể xóa tài khoản ADMIN", 400);
  }
  
  // Không thể xóa MEMBER
  if (roles.includes("MEMBER")) {
    throw appError("Không thể xóa tài khoản MEMBER", 400);
  }

  // Import model Book để kiểm tra lịch sử tạo/sửa sách
  const { default: Book } = await import("../../models/book.model.js");
  const { default: BorrowTicket } = await import("../../models/borrowTicket.model.js");

  // Kiểm tra xem staff có lịch sử làm việc không
  // - Tạo/sửa sách (created_by, updated_by)
  // - Duyệt phiếu mượn (approved_by, picked_up_by)
  const [bookCreated, bookUpdated, ticketApproved, ticketPickedUp] = await Promise.all([
    Book.count({ where: { created_by: userId } }),
    Book.count({ where: { updated_by: userId } }),
    BorrowTicket.count({ where: { approved_by: userId } }),
    BorrowTicket.count({ where: { picked_up_by: userId } }),
  ]);

  const hasWorkHistory = bookCreated > 0 || bookUpdated > 0 || ticketApproved > 0 || ticketPickedUp > 0;

  if (hasWorkHistory) {
    // Staff có lịch sử làm việc => chuyển status thành BANNED thay vì xóa
    // Điều này giữ lại dữ liệu lịch sử và tránh vi phạm foreign key
    await user.update({ status: "BANNED" });
    
    return {
      deleted: false,
      banned: true,
      reason: "Staff có lịch sử làm việc, đã chuyển sang trạng thái BANNED thay vì xóa",
      history: {
        books_created: bookCreated,
        books_updated: bookUpdated,
        tickets_approved: ticketApproved,
        tickets_picked_up: ticketPickedUp,
      },
    };
  }

  // Staff không có lịch sử làm việc => xóa hoàn toàn
  await user.destroy(); // Profile/AuthToken/RefreshToken sẽ CASCADE theo DB
  return { deleted: true, reason: "Đã xóa staff thành công" };
}
