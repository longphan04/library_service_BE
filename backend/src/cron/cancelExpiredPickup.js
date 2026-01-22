import { Op } from "sequelize";
import sequelize from "../config/dbConnection.js";
import BorrowTicket from "../models/borrowTicket.model.js";
import { syncBorrowItemsWithTicketFinalStatus } from "../services/borrowItem/borrow-state.service.js";
import { notifyMemberCancelled } from "../services/notification/notification.service.js";

let _started = false;

// Cron: quét phiếu APPROVED quá hạn pickup_expires_at => CANCELLED
// - Chỉ tác động lên status = APPROVED
// - Chỉ cancel khi pickup_expires_at <= NOW
// - Chạy theo batch để tránh query quá nặng
// - Gửi thông báo cho member khi phiếu bị hủy do hết hạn lấy sách
export function startCancelExpiredPickupCron() {
  if (_started) return;
  _started = true;

  const run = async () => {
    try {
      const now = new Date();

      // Lấy danh sách ticket cần cancel (bao gồm thông tin để gửi notification)
      const rows = await BorrowTicket.findAll({
        where: {
          status: "APPROVED",
          pickup_expires_at: {
            [Op.ne]: null,
            [Op.lte]: now,
          },
        },
        attributes: ["ticket_id", "ticket_code", "member_id"],
        limit: 500,
        raw: true,
      });

      if (!rows.length) return;

      const ids = rows.map((r) => r.ticket_id);

      await sequelize.transaction(async (t) => {
        await BorrowTicket.update(
          { status: "CANCELLED", cancelled_at: now },
          {
            where: {
              ticket_id: { [Op.in]: ids },
              status: "APPROVED", // double-check để tránh race
              pickup_expires_at: { [Op.lte]: now },
            },
            transaction: t,
          }
        );

        // Yêu cầu 2a: đồng bộ items theo ticket CANCELLED + trả book_copy về AVAILABLE
        for (const ticketId of ids) {
          await syncBorrowItemsWithTicketFinalStatus(ticketId, { transaction: t, staffUserId: null });
        }
      });

      // Gửi thông báo cho member (ngoài transaction để không ảnh hưởng logic chính)
      for (const ticket of rows) {
        await notifyMemberCancelled(ticket, "Hết hạn đến lấy sách");
      }

      console.log(`[cron][borrow-ticket] Đã hủy ${rows.length} phiếu hết hạn lấy sách.`);
    } catch (e) {
      console.error("[cron][borrow-ticket] cancelExpiredPickup failed:", e?.message || e);
    }
  };

  run();
  setInterval(run, 60 * 1000);
}
