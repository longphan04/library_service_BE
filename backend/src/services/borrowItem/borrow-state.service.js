import sequelize from "../../config/dbConnection.js";
import { Op } from "sequelize";

import BorrowTicket from "../../models/borrowTicket.model.js";
import BorrowItem from "../../models/borrowItem.model.js";

import { appError } from "../../utils/appError.js";
import { updateBorrowItemStatusService } from "./borrowItem.put.service.js";

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * (a) Đồng bộ trạng thái items theo ticket, chỉ khi ticket đã ở RETURNED hoặc CANCELLED.
 * - Được gọi khi STAFF update ticket -> RETURNED/CANCELLED
 * - Được gọi khi CRON cancelExpiredPickup chuyển ticket -> CANCELLED
 *
 * Hiệu năng:
 * - Query danh sách item_id một lần, sau đó gọi service update từng item để đảm bảo rule book_copy + bonus.
 */
export async function syncBorrowItemsWithTicketFinalStatus(ticketId, { transaction = null, staffUserId = null } = {}) {
  const id = toInt(ticketId);
  if (!id) throw appError("ticketId không hợp lệ", 400);

  const t = transaction ?? (await sequelize.transaction());
  const shouldCommit = !transaction;

  try {
    const ticket = await BorrowTicket.findByPk(id, {
      attributes: ["ticket_id", "status"],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!ticket) {
      if (shouldCommit) await t.commit();
      return null;
    }

    if (ticket.status !== "RETURNED" && ticket.status !== "CANCELLED") {
      if (shouldCommit) await t.commit();
      return { ok: true, synced: 0 };
    }

    const targetStatus = ticket.status;

    // Chỉ lấy item chưa đúng status để giảm xử lý
    const items = await BorrowItem.findAll({
      where: {
        ticket_id: id,
        status: { [Op.ne]: targetStatus },
      },
      attributes: ["borrow_item_id"],
      transaction: t,
      lock: t.LOCK.UPDATE,
      raw: true,
    });

    if (!items.length) {
      if (shouldCommit) await t.commit();
      return { ok: true, synced: 0 };
    }

    // Gọi service ở yêu cầu 1 để đảm bảo thống nhất logic book_copy + bonus
    // staffUserId: nếu cron / member cancel gọi thì có thể null
    // forceSync: đây là luồng đồng bộ theo ticket final, cần bỏ qua chặn "ticket đã kết thúc"
    for (const row of items) {
      await updateBorrowItemStatusService(
        row.borrow_item_id,
        staffUserId,
        { status: targetStatus },
        { transaction: t, forceSync: true }
      );
    }

    if (shouldCommit) await t.commit();
    return { ok: true, synced: items.length };
  } catch (e) {
    if (shouldCommit) await t.rollback();
    throw e;
  }
}

/**
 * (b) Nếu tất cả item của ticket chỉ nằm trong {RETURNED, REMOVED}
 * => chuyển ticket sang RETURNED.
 *
 * Hàm này được gọi sau khi update item -> RETURNED hoặc REMOVED.
 * Hiệu năng: dùng COUNT để check còn item nào "chưa xong" không.
 */
export async function ensureTicketReturnedIfAllItemsDone(ticketId, { transaction = null } = {}) {
  const id = toInt(ticketId);
  if (!id) throw appError("ticketId không hợp lệ", 400);

  const t = transaction ?? (await sequelize.transaction());
  const shouldCommit = !transaction;

  try {
    const notDone = await BorrowItem.count({
      where: {
        ticket_id: id,
        status: { [Op.notIn]: ["RETURNED", "REMOVED"] },
      },
      transaction: t,
    });

    if (notDone > 0) {
      if (shouldCommit) await t.commit();
      return { ok: true, changed: false };
    }

    // Không auto chuyển nếu ticket đã CANCELLED.
    // (Nếu muốn CANCELLED cũng chuyển RETURNED thì chỉnh rule tại đây)
    const [affected] = await BorrowTicket.update(
      { status: "RETURNED" },
      {
        where: {
          ticket_id: id,
          status: { [Op.notIn]: ["RETURNED", "CANCELLED"] },
        },
        transaction: t,
      }
    );

    if (shouldCommit) await t.commit();
    return { ok: true, changed: affected > 0 };
  } catch (e) {
    if (shouldCommit) await t.rollback();
    throw e;
  }
}
