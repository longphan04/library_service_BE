import Notification from "../../models/notification.model.js";
import { Op } from "sequelize";

// Số thông báo tối đa giữ lại cho mỗi user
const MAX_NOTIFICATIONS_PER_USER = 10;

/**
 * Xóa các thông báo cũ của user, chỉ giữ lại MAX_NOTIFICATIONS_PER_USER thông báo mới nhất
 * - Chạy không đồng bộ, không block response
 * - Dùng query tối ưu để tránh ảnh hưởng hiệu năng
 * 
 * @param {number} userId - ID của user cần xóa thông báo cũ
 */
export async function clearOldNotificationsService(userId) {
  if (!userId) return;

  try {
    // Lấy notification_id của thông báo thứ MAX_NOTIFICATIONS_PER_USER (để biết ngưỡng cắt)
    const cutoffNotification = await Notification.findOne({
      where: { user_id: userId },
      attributes: ["notification_id"],
      order: [["created_at", "DESC"]],
      offset: MAX_NOTIFICATIONS_PER_USER - 1, // Lấy thông báo thứ 10 (index 9)
      limit: 1,
      raw: true,
    });

    // Nếu không có thông báo thứ 10, nghĩa là user có ít hơn 10 thông báo → không cần xóa
    if (!cutoffNotification) return;

    // Xóa tất cả thông báo có notification_id nhỏ hơn ngưỡng cắt
    // (các thông báo cũ hơn thông báo thứ 10)
    await Notification.destroy({
      where: {
        user_id: userId,
        notification_id: { [Op.lt]: cutoffNotification.notification_id },
      },
    });
  } catch (error) {
    // Log lỗi nhưng không throw để không ảnh hưởng API chính
    console.error("[clearNotification] Lỗi khi xóa thông báo cũ:", error?.message || error);
  }
}
