import app from "./src/app.js";
import "dotenv/config";
import sequelize from "./src/config/dbConnection.js";
import { applyAllAssociations } from "./src/models/associations.model.js";
import { startCheckBookHoldCron } from "./src/cron/checkBookHold.js";
import { startCancelExpiredPickupCron } from "./src/cron/cancelExpiredPickup.js";
import { startCheckOverdueCron } from "./src/cron/checkOverdue.js";

const PORT = process.env.PORT || 3000;

async function main() {
  try {
    applyAllAssociations(); // <-- đặt ở đây (1 lần)
    await sequelize.authenticate();
    console.log("Connected database success");
    // Khởi động cron job kiểm tra book hold hết hạn
    startCheckBookHoldCron();
    // Cron tự động huỷ phiếu APPROVED quá hạn đến lấy
    startCancelExpiredPickupCron();
    // Cron kiểm tra phiếu mượn quá hạn và gửi thông báo
    startCheckOverdueCron();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server is running on http://10.0.5.101:${PORT}`);
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.log("Connected fail", error);
    process.exit(1);
  }

}
main();