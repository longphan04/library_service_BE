// file này chứa các hàm gửi email dùng chung
import nodemailer from "nodemailer";

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
  API_BASE_URL,   // ví dụ: http://localhost:3000
  CLIENT_BASE_URL // (tuỳ) ví dụ: http://localhost:5173
} = process.env;

function createTransporter() {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error("Thiếu cấu hình SMTP env (SMTP_HOST/PORT/USER/PASS)");
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465, // 465 = true, 587 = false
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function sendVerifyEmail({ to, token, fullName }) {
  const transporter = createTransporter();

  const base = API_BASE_URL || "http://localhost:3000";
  const verifyLink = `${base}/auth/verify-email?token=${encodeURIComponent(token)}`;

  const from = MAIL_FROM || SMTP_USER;

  await transporter.sendMail({
    from,
    to,
    subject: "Xác nhận đăng ký tài khoản",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <p>Chào ${fullName || ""},</p>
        <p>Bấm vào nút dưới đây để xác nhận email:</p>
        <p>
          <a href="${verifyLink}" 
             style="display:inline-block;padding:10px 14px;background:#111;color:#fff;text-decoration:none;border-radius:6px">
             Xác nhận email
          </a>
        </p>
        <p>Nếu bạn không đăng ký tài khoản, hãy bỏ qua email này.</p>
        <p style="color:#666;font-size:12px">Link sẽ hết hạn sau 10 phút.</p>
      </div>
    `,
  });
}

/**
 * MOBILE APP: gửi OTP 6 số để xác nhận email.
 * - OTP chỉ mang tính tạm thời (mặc định 5 phút)
 * - Không gửi link trong email để đảm bảo đúng flow app
 */
export async function sendVerifyOtpEmail({ to, otp, fullName }) {
  const transporter = createTransporter();
  const from = MAIL_FROM || SMTP_USER;

  // Lấy TTL để hiển thị trong email (mặc định 5 phút)
  const ttlMin = Number(process.env.VERIFY_OTP_TTL_MIN || 5);

  await transporter.sendMail({
    from,
    to,
    subject: "Mã OTP xác nhận email",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <p>Chào ${fullName || ""},</p>
        <p>Mã OTP để xác nhận email của bạn là:</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:4px;margin:12px 0">
          ${String(otp)}
        </div>
        <p style="color:#666;font-size:12px">Mã OTP sẽ hết hạn sau ${ttlMin} phút và chỉ dùng 1 lần.</p>
        <p style="color:#666;font-size:12px">Nếu bạn không thực hiện đăng ký, hãy bỏ qua email này.</p>
      </div>
    `,
  });
}

// gửi email đặt lại mật khẩu
export async function sendResetPasswordEmail({ to, token, fullName }) {
  const transporter = createTransporter();
  const from = MAIL_FROM || SMTP_USER;

  const base = API_BASE_URL || "http://localhost:3000";
  const resetLink = `${base}/auth/reset-password?token=${encodeURIComponent(token)}`;

  await transporter.sendMail({
    from,
    to,
    subject: "Đặt lại mật khẩu",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <p>Chào ${fullName || ""},</p>
        <p>Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu.</p>

        <p>
          <a href="${resetLink}"
            style="display:inline-block;padding:10px 14px;background:#111;color:#fff;text-decoration:none;border-radius:6px">
            Đặt lại mật khẩu
          </a>
        </p>

        <p style="color:#666;font-size:12px">Link sẽ hết hạn sau ${process.env.RESET_TTL_MIN || 10} phút.</p>
      </div>
    `,
  });
}

