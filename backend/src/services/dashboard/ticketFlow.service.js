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
 * Format ngày sang dạng YYYY-MM-DD theo timezone local
 * Tránh dùng toISOString() vì nó chuyển sang UTC gây lệch ngày
 * @param {Date} date - Đối tượng Date
 * @returns {string} - Ngày dạng 'YYYY-MM-DD'
 */
function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Tạo danh sách ngày từ startDate đến endDate (bao gồm cả 2 đầu)
 * @param {string} startDateStr - Ngày bắt đầu dạng 'YYYY-MM-DD'
 * @param {string} endDateStr - Ngày kết thúc dạng 'YYYY-MM-DD'
 * @returns {string[]} - Mảng các ngày định dạng 'YYYY-MM-DD'
 */
function generateDateRange(startDateStr, endDateStr) {
  const dates = [];
  const [sy, sm, sd] = startDateStr.split("-").map(Number);
  const [ey, em, ed] = endDateStr.split("-").map(Number);

  const current = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  while (current <= end) {
    dates.push(formatLocalDate(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Format ngày sang dạng dd/MM để hiển thị trên biểu đồ
 * @param {string} dateStr - Ngày dạng 'YYYY-MM-DD'
 * @returns {string} - Ngày dạng 'dd/MM'
 */
function formatDateLabel(dateStr) {
  const [, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}

/**
 * Lấy thống kê luồng phiếu mượn (PENDING, APPROVED, CANCELLED) theo ngày
 * - period=week: 7 ngày gần nhất (ngày hiện tại + 6 ngày trước)
 * - period=month: 30 ngày gần nhất (ngày hiện tại + 29 ngày trước)
 * @param {Object} options - { period: 'week' | 'month' }
 * @returns {Object} - Dữ liệu thống kê cho biểu đồ
 */
export async function getTicketFlowStatsService({ period = "week" } = {}) {
  // Số ngày cần lấy: 7 hoặc 30
  const days = period === "month" ? 30 : 7;

  // Tính ngày kết thúc = ngày hiện tại (theo timezone local)
  const now = new Date();
  const endDateStr = formatLocalDate(now);

  // Tính ngày bắt đầu = lùi về (days - 1) ngày
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
  const startDateStr = formatLocalDate(startDate);

  // Tạo danh sách ngày trong khoảng
  const dateRange = generateDateRange(startDateStr, endDateStr);

  // Query thống kê PENDING, APPROVED, CANCELLED trong 1 query duy nhất
  // PENDING: tính theo requested_at (thời điểm tạo phiếu)
  // APPROVED: tính theo approved_at
  // CANCELLED: tính theo cancelled_at
  const [stats] = await sequelize.query(`
    SELECT 
      DATE(requested_at) AS date,
      'PENDING' AS type,
      COUNT(*) AS count
    FROM borrow_tickets
    WHERE 
      DATE(requested_at) >= :startDate
      AND DATE(requested_at) <= :endDate
    GROUP BY DATE(requested_at)
    
    UNION ALL
    
    SELECT 
      DATE(approved_at) AS date,
      'APPROVED' AS type,
      COUNT(*) AS count
    FROM borrow_tickets
    WHERE 
      approved_at IS NOT NULL
      AND DATE(approved_at) >= :startDate
      AND DATE(approved_at) <= :endDate
    GROUP BY DATE(approved_at)
    
    UNION ALL
    
    SELECT 
      DATE(cancelled_at) AS date,
      'CANCELLED' AS type,
      COUNT(*) AS count
    FROM borrow_tickets
    WHERE 
      cancelled_at IS NOT NULL
      AND DATE(cancelled_at) >= :startDate
      AND DATE(cancelled_at) <= :endDate
    GROUP BY DATE(cancelled_at)
  `, {
    replacements: { startDate: startDateStr, endDate: endDateStr },
  });

  // Tạo map để lookup nhanh theo ngày
  const pendingMap = new Map();
  const approvedMap = new Map();
  const cancelledMap = new Map();
  for (const row of stats) {
    const dateKey = formatLocalDate(new Date(row.date));
    const count = Number(row.count);
    if (row.type === "PENDING") {
      pendingMap.set(dateKey, count);
    } else if (row.type === "APPROVED") {
      approvedMap.set(dateKey, count);
    } else {
      cancelledMap.set(dateKey, count);
    }
  }

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
      start_date: startDateStr,
      end_date: endDateStr,
      chart: chartData,
      summary: {
        total_pending: totalPending,
        total_approved: totalApproved,
        total_cancelled: totalCancelled,
      },
    },
  };
}

