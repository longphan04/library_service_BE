import sequelize from "../../config/dbConnection.js";

/**
 * API: GET /dashboard/borrow-return
 * Thống kê số lượng phiếu mượn theo trạng thái PICKED_UP và RETURNED
 * theo từng ngày trong khoảng thời gian (7 ngày hoặc 30 ngày gần nhất)
 *
 * Dữ liệu trả về dùng cho biểu đồ đường:
 * - Trục X: ngày (dd/MM)
 * - Trục Y: số lượng ticket
 * - 2 đường: PICKED_UP và RETURNED
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
 * Lấy thống kê lượt mượn/trả theo ngày
 * @param {Object} options - { period: 'week' | 'month' }
 * @returns {Object} - Dữ liệu thống kê cho biểu đồ
 */
export async function getBorrowReturnStatsService({ period = "week" } = {}) {
  // Xác định khoảng thời gian
  const days = period === "month" ? 30 : 7;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days + 1);
  startDate.setHours(0, 0, 0, 0);

  // Tạo danh sách ngày
  const dateRange = generateDateRange(startDate, endDate);

  // Query thống kê PICKED_UP theo picked_up_at
  // Dùng raw query để tối ưu hiệu năng, group theo ngày
  const [pickedUpStats] = await sequelize.query(`
    SELECT 
      DATE(picked_up_at) AS date,
      COUNT(*) AS count
    FROM borrow_tickets
    WHERE 
      picked_up_at IS NOT NULL
      AND picked_up_at >= :startDate
      AND picked_up_at < DATE_ADD(:endDate, INTERVAL 1 DAY)
    GROUP BY DATE(picked_up_at)
    ORDER BY date ASC
  `, {
    replacements: {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    },
  });

  // Query thống kê RETURNED theo returned_at
  const [returnedStats] = await sequelize.query(`
    SELECT 
      DATE(returned_at) AS date,
      COUNT(*) AS count
    FROM borrow_tickets
    WHERE 
      returned_at IS NOT NULL
      AND returned_at >= :startDate
      AND returned_at < DATE_ADD(:endDate, INTERVAL 1 DAY)
    GROUP BY DATE(returned_at)
    ORDER BY date ASC
  `, {
    replacements: {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    },
  });

  // Chuyển kết quả query thành map để lookup nhanh
  const pickedUpMap = new Map(
    pickedUpStats.map((row) => [row.date, Number(row.count)])
  );
  const returnedMap = new Map(
    returnedStats.map((row) => [row.date, Number(row.count)])
  );

  // Xây dựng dữ liệu cho biểu đồ
  // Đảm bảo mỗi ngày đều có giá trị (0 nếu không có dữ liệu)
  const chartData = dateRange.map((dateStr) => ({
    date: dateStr,
    label: formatDateLabel(dateStr),
    picked_up: pickedUpMap.get(dateStr) || 0,
    returned: returnedMap.get(dateStr) || 0,
  }));

  // Tính tổng
  const totalPickedUp = chartData.reduce((sum, d) => sum + d.picked_up, 0);
  const totalReturned = chartData.reduce((sum, d) => sum + d.returned, 0);

  return {
    data: {
      period,
      days,
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      chart: chartData,
      summary: {
        total_picked_up: totalPickedUp,
        total_returned: totalReturned,
      },
    },
  };
}
