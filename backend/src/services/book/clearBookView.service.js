import BookView from "../../models/bookView.model.js";
import { Op } from "sequelize";

// Số lượng book view tối đa giữ lại cho mỗi user
const MAX_BOOK_VIEWS_PER_USER = 3;

/**
 * Xóa các book view cũ của user, chỉ giữ lại MAX_BOOK_VIEWS_PER_USER view mới nhất
 * - Chạy không đồng bộ, không block response
 * - Dùng query tối ưu để tránh ảnh hưởng hiệu năng
 * 
 * @param {number} userId - ID của user cần xóa book view cũ
 */
export async function clearOldBookViewsService(userId) {
  if (!userId) return;

  try {
    // Lấy view_id của book view thứ MAX_BOOK_VIEWS_PER_USER (để biết ngưỡng cắt)
    const cutoffView = await BookView.findOne({
      where: { user_id: userId },
      attributes: ["view_id"],
      order: [["viewed_at", "DESC"]],
      offset: MAX_BOOK_VIEWS_PER_USER - 1, // Lấy view thứ 3 (index 2)
      limit: 1,
      raw: true,
    });

    // Nếu không có view thứ 3, nghĩa là user có ít hơn 3 view → không cần xóa
    if (!cutoffView) return;

    // Xóa tất cả view có view_id nhỏ hơn ngưỡng cắt
    // (các view cũ hơn view thứ 3)
    await BookView.destroy({
      where: {
        user_id: userId,
        view_id: { [Op.lt]: cutoffView.view_id },
      },
    });
  } catch (error) {
    // Log lỗi nhưng không throw để không ảnh hưởng API chính
    console.error("[clearBookView] Lỗi khi xóa book view cũ:", error?.message || error);
  }
}
