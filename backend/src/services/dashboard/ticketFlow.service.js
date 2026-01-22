import sequelize from "../../config/dbConnection.js";

/**
 * API: GET /dashboard/ticket-flow
 * Thống kê số lượng phiếu mượn theo trạng thái PENDING, APPROVED, CANCELLED
 * theo từng ngày trong khoảng thời gian (7 ngày hoặc 30 ngày gần nhất)
 *
 * Dữ liệu trả về dùng cho biểu đồ đường:
 * - Trục X: ngày (dd/MM)
 * - Trục Y: số lượng ticket
 * - 3 đường: PENDING, APPROVED, CANCELLED
 */

/**
 * Tạo danh sách ngày từ startDate đến endDate
 * @param {Date} startDate - Ngày bắt đầu
 * @param {Date} endDate - Ngày kết thúc
 * @returns {string[]} - Mảng các ngày định dạng 'YYYY-MM-DD'
 */
function generateDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]); // 'YYYY-MM-DD'
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Format ngày sang dạng dd/MM để hiển thị
 * @param {string} dateStr - Ngày dạng 'YYYY-MM-DD'
 * @returns {string} - Ngày dạng 'dd/MM'
 */
function formatDateLabel(dateStr) {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}

/**
 * Lấy thống kê luồng phiếu mượn (PENDING, APPROVED, CANCELLED) theo ngày
 * @param {Object} options - { period: 'week' | 'month' }
 * @returns {Object} - Dữ liệu thống kê cho biểu đồ
 */
export async function getTicketFlowStatsService({ period = "week" } = {}) {
  // Xác định khoảng thời gian
  const days = period === "month" ? 30 : 7;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days + 1);
  startDate.setHours(0, 0, 0, 0);

  // Tạo danh sách ngày
  const dateRange = generateDateRange(startDate, endDate);

  // Query thống kê PENDING theo requested_at (thời điểm tạo phiếu)
  const [pendingStats] = await sequelize.query(`
    SELECT 
      DATE(requested_at) AS date,
      COUNT(*) AS count
    FROM borrow_tickets
    WHERE 
      requested_at >= :startDate
      AND requested_at < DATE_ADD(:endDate, INTERVAL 1 DAY)
    GROUP BY DATE(requested_at)
    ORDER BY date ASC
  `, {
    replacements: {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    },
  });

  // Query thống kê APPROVED theo approved_at
  const [approvedStats] = await sequelize.query(`
    SELECT 
      DATE(approved_at) AS date,
      COUNT(*) AS count
    FROM borrow_tickets
    WHERE 
      approved_at IS NOT NULL
      AND approved_at >= :startDate
      AND approved_at < DATE_ADD(:endDate, INTERVAL 1 DAY)
    GROUP BY DATE(approved_at)
    ORDER BY date ASC
  `, {
    replacements: {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    },
  });

  // Query thống kê CANCELLED theo cancelled_at
  const [cancelledStats] = await sequelize.query(`
    SELECT 
      DATE(cancelled_at) AS date,
      COUNT(*) AS count
    FROM borrow_tickets
    WHERE 
      cancelled_at IS NOT NULL
      AND cancelled_at >= :startDate
      AND cancelled_at < DATE_ADD(:endDate, INTERVAL 1 DAY)
    GROUP BY DATE(cancelled_at)
    ORDER BY date ASC
  `, {
    replacements: {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    },
  });

  // Chuyển kết quả query thành map để lookup nhanh
  const pendingMap = new Map(
    pendingStats.map((row) => [row.date, Number(row.count)])
  );
  const approvedMap = new Map(
    approvedStats.map((row) => [row.date, Number(row.count)])
  );
  const cancelledMap = new Map(
    cancelledStats.map((row) => [row.date, Number(row.count)])
  );

  // Xây dựng dữ liệu cho biểu đồ
  // Đảm bảo mỗi ngày đều có giá trị (0 nếu không có dữ liệu)
  const chartData = dateRange.map((dateStr) => ({
    date: dateStr,
    label: formatDateLabel(dateStr),
    pending: pendingMap.get(dateStr) || 0,
    approved: approvedMap.get(dateStr) || 0,
    cancelled: cancelledMap.get(dateStr) || 0,
  }));

  // Tính tổng
  const totalPending = chartData.reduce((sum, d) => sum + d.pending, 0);
  const totalApproved = chartData.reduce((sum, d) => sum + d.approved, 0);
  const totalCancelled = chartData.reduce((sum, d) => sum + d.cancelled, 0);

  return {
    data: {
      period,
      days,
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      chart: chartData,
      summary: {
        total_pending: totalPending,
        total_approved: totalApproved,
        total_cancelled: totalCancelled,
      },
    },
  };
}
