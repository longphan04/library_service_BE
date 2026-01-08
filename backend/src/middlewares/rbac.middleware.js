// RBAC này dùng sau khi đã xác thực đăng nhập (auth.middleware.js)
import User from "../models/user.model.js";
import Role from "../models/role.model.js";


// Lấy danh sách role hiện tại của user
async function getCurrentRoles(userId) {
  const user = await User.findByPk(userId, {
    attributes: ["user_id"],
    include: [
      { model: Role, as: "roles", attributes: ["name"], through: { attributes: [] } },
    ],
  });

  if (!user) return null; // phân biệt "không tồn tại"
  return (user.roles || []).map(r => r.name);
}
// Middleware kiểm tra role
export function requireRole(...allowRoles) {
  return async (req, res, next) => {
    try {
      const userId = req.auth?.user_id;
      if (!userId) return res.status(401).json({ message: "Chưa đăng nhập" });

      const roles = await getCurrentRoles(userId);
      if (roles === null) return res.status(401).json({ message: "Tài khoản không tồn tại" });

      if (roles.includes("ADMIN")) return next();

      const ok = roles.some(r => allowRoles.includes(r));
      if (!ok) return res.status(403).json({ message: "Không đủ quyền" });

      return next();
    } catch (err) {
      return next(err);
    }
  };
}
