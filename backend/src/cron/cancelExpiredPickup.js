import { Op } from "sequelize";
import sequelize from "../config/dbConnection.js";
import BorrowTicket from "../models/borrowTicket.model.js";
import { syncBorrowItemsWithTicketFinalStatus } from "../services/borrowItem/borrow-state.service.js";

let _started = false;

// Cron: quét phiếu APPROVED quá hạn pickup_expires_at => CANCELLED
// - Chỉ tác động lên status = APPROVED
// - Chỉ cancel khi pickup_expires_at <= NOW
// - Chạy theo batch để tránh query quá nặng
export function startCancelExpiredPickupCron() {
  if (_started) return;
  _started = true;

  const run = async () => {
    try {
      const now = new Date();

      // Lấy danh sách id cần cancel (nhẹ) rồi update theo batch
      const rows = await BorrowTicket.findAll({
        where: {
          status: "APPROVED",
          pickup_expires_at: {
            [Op.ne]: null,
            [Op.lte]: now,
          },
        },
        attributes: ["ticket_id"],
        limit: 500,
        raw: true,
      });

      if (!rows.length) return;

      const ids = rows.map((r) => r.ticket_id);

      await sequelize.transaction(async (t) => {
        await BorrowTicket.update(
          { status: "CANCELLED" },
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
    } catch (e) {
      console.error("[cron][borrow-ticket] cancelExpiredPickup failed:", e?.message || e);
    }
  };

  run();
  setInterval(run, 60 * 1000);
}
