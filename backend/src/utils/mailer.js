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
