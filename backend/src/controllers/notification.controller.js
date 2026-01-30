import {
  getNotificationsService,
  getUnreadCountService,
  markAsReadService,
  markAllAsReadService,
} from "../services/notification/notification.service.js";
import { clearOldNotificationsService } from "../services/notification/clearNotification.service.js";

// GET /notification?limit=20
export async function getNotifications(req, res, next) {
  try {
    const notifications = await getNotificationsService(req.auth.user_id, {
      limit: req.query.limit,
    });
    return res.json({ data: notifications });
  } catch (e) {
    next(e);
  }
}

// GET /notification/unread-count
// Đồng thời dọn dẹp thông báo cũ (không block response)
export async function getUnreadCount(req, res, next) {
  try {
    const userId = req.auth.user_id;
    const count = await getUnreadCountService(userId);

    // Gọi hàm xóa thông báo cũ không đồng bộ (không await để không block response)
    clearOldNotificationsService(userId).catch(() => {});

    return res.json({ data: { unread_count: count } });
  } catch (e) {
    next(e);
  }
}

// PUT /notification/:id/read
export async function markAsRead(req, res, next) {
  try {
    const notificationId = Number(req.params.id);
    if (!Number.isFinite(notificationId)) {
      return res.status(400).json({ message: "notification_id không hợp lệ" });
    }

    const success = await markAsReadService(notificationId, req.auth.user_id);
    if (!success) {
      return res.status(404).json({ message: "Không tìm thấy thông báo" });
    }

    return res.json({ data: { notification_id: notificationId, is_read: true } });
  } catch (e) {
    next(e);
  }
}

// PUT /notification/read-all
export async function markAllAsRead(req, res, next) {
  try {
    const affected = await markAllAsReadService(req.auth.user_id);
    return res.json({ data: { marked_count: affected } });
  } catch (e) {
    next(e);
  }
}
