import Notification from "../../models/notification.model.js";
import User from "../../models/user.model.js";
import Role from "../../models/role.model.js";
import UserRole from "../../models/userRole.model.js";

// ===========================
// Các hàm helper tạo thông báo
// ===========================

/**
 * Lấy danh sách user_id có role STAFF
 * (dùng để gửi thông báo khi member tạo phiếu mượn mới)
 */
async function getStaffUserIds() {
  const staffRole = await Role.findOne({ where: { name: "STAFF" }, attributes: ["role_id"], raw: true });
  if (!staffRole) return [];

  const userRoles = await UserRole.findAll({
    where: { role_id: staffRole.role_id },
    attributes: ["user_id"],
    raw: true,
  });

  return userRoles.map((r) => r.user_id);
}

/**
 * Gửi thông báo cho TẤT CẢ staff khi member tạo phiếu mượn mới
 * @param {Object} ticket - phiếu mượn đã tạo xong (cần ticket_id, ticket_code, member_id)
 */
export async function notifyStaffBorrowCreated(ticket) {
  try {
    const staffIds = await getStaffUserIds();
    if (!staffIds.length) return;

    const notifications = staffIds.map((user_id) => ({
      user_id,
      type: "BORROW_CREATED",
      title: "Phiếu mượn mới",
      content: `Có phiếu mượn mới #${ticket.ticket_code} cần duyệt.`,
      reference_id: ticket.ticket_id,
      is_read: false,
    }));

    await Notification.bulkCreate(notifications);
  } catch (e) {
    console.error("[notification] notifyStaffBorrowCreated failed:", e?.message || e);
  }
}

// /**
//  * Gửi thông báo cho member khi phiếu được duyệt (APPROVED)
//  * @param {Object} ticket - phiếu mượn (cần ticket_id, ticket_code, member_id, pickup_expires_at)
//  */
export async function notifyMemberApproved(ticket) {
  try {
    await Notification.create({
      user_id: ticket.member_id,
      type: "BORROW_APPROVED",
      title: "Phiếu mượn được duyệt",
      content: `Phiếu mượn #${ticket.ticket_code} đã được duyệt. Vui lòng đến lấy sách trước ${formatDate(ticket.pickup_expires_at)}.`,
      reference_id: ticket.ticket_id,
      is_read: false,
    });
  } catch (e) {
    console.error("[notification] notifyMemberApproved failed:", e?.message || e);
  }
}

/**
 * Gửi thông báo cho member khi đã lấy sách (PICKED_UP)
 * @param {Object} ticket - phiếu mượn (cần ticket_id, ticket_code, member_id, due_date)
 */
export async function notifyMemberPickedUp(ticket) {
  try {
    await Notification.create({
      user_id: ticket.member_id,
      type: "BORROW_PICKED_UP",
      title: "Đã lấy sách",
      content: `Bạn đã lấy sách theo phiếu #${ticket.ticket_code}. Hạn trả: ${formatDate(ticket.due_date)}.`,
      reference_id: ticket.ticket_id,
      is_read: false,
    });
  } catch (e) {
    console.error("[notification] notifyMemberPickedUp failed:", e?.message || e);
  }
}

/**
 * Gửi thông báo cho member khi đã trả sách (RETURNED)
 * @param {Object} ticket - phiếu mượn (cần ticket_id, ticket_code, member_id)
 */
export async function notifyMemberReturned(ticket) {
  try {
    await Notification.create({
      user_id: ticket.member_id,
      type: "BORROW_RETURNED",
      title: "Đã trả sách",
      content: `Phiếu mượn #${ticket.ticket_code} đã hoàn thành. Cảm ơn bạn!`,
      reference_id: ticket.ticket_id,
      is_read: false,
    });
  } catch (e) {
    console.error("[notification] notifyMemberReturned failed:", e?.message || e);
  }
}

/**
 * Gửi thông báo cho member khi phiếu bị hủy (CANCELLED)
 * @param {Object} ticket - phiếu mượn (cần ticket_id, ticket_code, member_id)
 * @param {string} reason - lý do hủy (tùy chọn)
 */
export async function notifyMemberCancelled(ticket, reason = "") {
  try {
    let content = `Phiếu mượn #${ticket.ticket_code} đã bị hủy.`;
    if (reason) {
      content += ` Lý do: ${reason}`;
    }

    await Notification.create({
      user_id: ticket.member_id,
      type: "BORROW_CANCELLED",
      title: "Phiếu mượn bị hủy",
      content,
      reference_id: ticket.ticket_id,
      is_read: false,
    });
  } catch (e) {
    console.error("[notification] notifyMemberCancelled failed:", e?.message || e);
  }
}

/**
 * Gửi thông báo cho member khi quá hạn trả sách (OVERDUE)
 * @param {Object} ticket - phiếu mượn (cần ticket_id, ticket_code, member_id, due_date)
 */
export async function notifyMemberOverdue(ticket) {
  try {
    await Notification.create({
      user_id: ticket.member_id,
      type: "BORROW_OVERDUE",
      title: "Quá hạn trả sách",
      content: `Phiếu mượn #${ticket.ticket_code} đã quá hạn trả từ ${formatDate(ticket.due_date)}. Vui lòng trả sách sớm để tránh phạt.`,
      reference_id: ticket.ticket_id,
      is_read: false,
    });
  } catch (e) {
    console.error("[notification] notifyMemberOverdue failed:", e?.message || e);
  }
}

// ===========================
// API service: lấy thông báo của user
// ===========================

/**
 * Lấy danh sách thông báo của user, sắp xếp mới nhất trước
 * @param {number} userId 
 * @param {Object} options - { limit }
 */
export async function getNotificationsService(userId, { limit = 20 } = {}) {
  const notifications = await Notification.findAll({
    where: { user_id: userId },
    order: [["created_at", "DESC"]],
    limit: Math.min(Math.max(1, Number(limit) || 20), 100),
  });
  return notifications;
}

/**
 * Đếm số thông báo chưa đọc của user
 * @param {number} userId 
 */
export async function getUnreadCountService(userId) {
  const count = await Notification.count({
    where: { user_id: userId, is_read: false },
  });
  return count;
}

/**
 * Đánh dấu thông báo đã đọc
 * @param {number} notificationId 
 * @param {number} userId - để đảm bảo chỉ user sở hữu mới được đánh dấu
 */
export async function markAsReadService(notificationId, userId) {
  const [affected] = await Notification.update(
    { is_read: true },
    { where: { notification_id: notificationId, user_id: userId } }
  );
  return affected > 0;
}

/**
 * Đánh dấu TẤT CẢ thông báo của user đã đọc
 * @param {number} userId 
 */
export async function markAllAsReadService(userId) {
  const [affected] = await Notification.update(
    { is_read: true },
    { where: { user_id: userId, is_read: false } }
  );
  return affected;
}

// ===========================
// Helper
// ===========================

function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
