import { Op } from "sequelize";
import BorrowTicket from "../models/borrowTicket.model.js";
import { notifyMemberOverdue } from "../services/notification/notification.service.js";

let _started = false;

// Cron: quét phiếu mượn PICKED_UP đã quá hạn (due_date < NOW) và chưa gửi thông báo
// - Chỉ tác động lên status = PICKED_UP
// - Chỉ gửi thông báo khi overdue_notified = false
// - Đánh dấu overdue_notified = true sau khi gửi
// - Chạy mỗi 60 giây
export function startCheckOverdueCron() {
  if (_started) return;
  _started = true;

  const run = async () => {
    try {
      const now = new Date();

      // Lấy danh sách phiếu quá hạn chưa được thông báo
      const overdueTickets = await BorrowTicket.findAll({
        where: {
          status: "PICKED_UP",
          due_date: {
            [Op.ne]: null,
            [Op.lt]: now, // đã quá hạn
          },
          overdue_notified: false,
        },
        attributes: ["ticket_id", "ticket_code", "member_id", "due_date"],
        limit: 100, // batch nhỏ để tránh quá tải
        raw: true,
      });

      if (!overdueTickets.length) return;

      const ticketIds = overdueTickets.map((t) => t.ticket_id);

      // Đánh dấu đã gửi thông báo trước (để tránh gửi trùng nếu có lỗi)
      await BorrowTicket.update(
        { overdue_notified: true },
        {
          where: {
            ticket_id: { [Op.in]: ticketIds },
            overdue_notified: false,
          },
        }
      );

      // Gửi thông báo cho từng member
      for (const ticket of overdueTickets) {
        await notifyMemberOverdue(ticket);
      }

      console.log(`[cron][overdue] Đã gửi thông báo quá hạn cho ${overdueTickets.length} phiếu.`);
    } catch (e) {
      console.error("[cron][overdue] checkOverdue failed:", e?.message || e);
    }
  };

  // Chạy ngay lập tức rồi mỗi 60 giây
  run();
  setInterval(run, 60 * 1000);
}
