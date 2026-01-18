import { sweepExpiredBookHoldsService } from "../services/book/bookHold.service.js";

let _started = false;

// chạy cron kiểm tra các book hold hết hạn mỗi phút
// - xóa các hold đã hết hạn
// - trả lại trạng thái AVAILABLE cho các bản sao đang HELD
export function startCheckBookHoldCron() {
  if (_started) return;
  _started = true;

  // chạy ngay lập tức sau đó mỗi 60 giây
  const run = async () => {
    try {
      await sweepExpiredBookHoldsService({ limit: 500 });
    } catch (e) {
      // tránh làm sập server vì cron
      console.error("[cron][book-hold] sweep failed:", e?.message || e);
    }
  };

  run();
  setInterval(run, 60 * 1000);
}
