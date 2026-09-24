const nodemailer = require('nodemailer');
const { getAppUrl } = require('../utils/moiTruong');

const { ROLE_LABEL } = require('../utils/hangSo');
const SYSTEM_NAME = 'Hệ thống Chăm sóc Sinh viên ITC';

let cachedTransporter = null;
let cachedKey = '';

function smtpConfig() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) return null;
  const port = Number(SMTP_PORT) || 587;
  return {
    host: SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465, // 465 = implicit TLS; 587 upgrades with STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Fail fast so an unreachable SMTP server never stalls the request.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  };
}

// One transporter per SMTP config, rebuilt only if the env changes.
function getTransporter() {
  const config = smtpConfig();
  if (!config) return null;
  const key = `${config.host}:${config.port}:${config.auth.user}:${config.auth.pass}`;
  if (key !== cachedKey) {
    cachedTransporter = nodemailer.createTransport(config);
    cachedKey = key;
  }
  return cachedTransporter;
}

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );

/**
 * Sends one email. Never throws: returns true when the SMTP server accepted it,
 * false when SMTP is not configured or delivery failed.
 */
async function deliver({ to, subject, html, text }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[Email] SMTP chưa cấu hình, không gửi được email tới ${to}.`);
    return false;
  }
  try {
    await transporter.sendMail({
      from: `"Hệ thống Quản lý ITC Care" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text,
    });
    console.log(`[Email] Đã gửi "${subject}" tới ${to}.`);
    return true;
  } catch (error) {
    console.warn(`[Email] Gửi email tới ${to} thất bại:`, error.message);
    return false;
  }
}

const linkButton = (href, label) =>
  `<p><a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 20px;background:#5e35b1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${label}</a></p>
   <p style="color:#64748b;font-size:13px">Nếu nút không bấm được, hãy mở liên kết sau:<br>${escapeHtml(href)}</p>`;

/** Login details for an account an admin created or whose password an admin reset. */
function sendAccountEmail({ to, fullName, password, role, isReset = false }) {
  const roleLabel = ROLE_LABEL[role] || ROLE_LABEL.staff;
  const intro = isReset
    ? `Mật khẩu tài khoản của bạn trên <b>${SYSTEM_NAME}</b> vừa được quản trị viên đặt lại:`
    : `Tài khoản nhân sự của bạn trên <b>${SYSTEM_NAME}</b> đã được khởi tạo:`;
  return deliver({
    to,
    subject: isReset
      ? '[ITC Care] Mật khẩu tài khoản đã được đặt lại'
      : '[ITC Care] Thông tin tài khoản nhân sự mới',
    html: `
      <h3>Xin chào ${escapeHtml(fullName)},</h3>
      <p>${intro}</p>
      <ul>
        <li><b>Email:</b> ${escapeHtml(to)}</li>
        <li><b>Mật khẩu đăng nhập:</b> <code>${escapeHtml(password)}</code></li>
        <li><b>Vai trò:</b> ${roleLabel}</li>
      </ul>
      <p>Vui lòng đăng nhập và đổi mật khẩu sau lần đăng nhập đầu tiên.</p>
    `,
    text: [
      `Xin chào ${fullName},`,
      isReset
        ? 'Mật khẩu tài khoản ITC Care của bạn vừa được đặt lại.'
        : 'Tài khoản ITC Care của bạn đã được khởi tạo.',
      `Email: ${to}`,
      `Mật khẩu đăng nhập: ${password}`,
      `Vai trò: ${roleLabel}`,
    ].join('\n'),
  });
}

/** Confirmation link for a self-registered account. */
// "72" -> "3 ngày", "36" -> "36 giờ".
const formatHours = (hours) => (hours % 24 === 0 ? `${hours / 24} ngày` : `${hours} giờ`);

function sendVerificationEmail({ to, fullName, role, token, hours }) {
  const validFor = formatHours(hours);
  const link = `${getAppUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  return deliver({
    to,
    subject: '[ITC Care] Xác thực email đăng ký tài khoản',
    html: `
      <h3>Xin chào ${escapeHtml(fullName)},</h3>
      <p>Bạn vừa đăng ký tài khoản <b>${ROLE_LABEL[role] || ''}</b> trên <b>${SYSTEM_NAME}</b>.
      Bấm nút dưới đây để xác thực email và kích hoạt tài khoản (liên kết có hiệu lực ${validFor}):</p>
      ${linkButton(link, 'Xác thực email')}
      <p>Nếu bạn không đăng ký, hãy bỏ qua email này.</p>
    `,
    text: `Xin chào ${fullName},\nMở liên kết sau để xác thực email và kích hoạt tài khoản ITC Care (hiệu lực ${validFor}):\n${link}\nNếu bạn không đăng ký, hãy bỏ qua email này.`,
  });
}

/** Link for the self-service "forgot password" flow. */
function sendPasswordResetEmail({ to, fullName, token, minutes }) {
  const link = `${getAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  return deliver({
    to,
    subject: '[ITC Care] Đặt lại mật khẩu',
    html: `
      <h3>Xin chào ${escapeHtml(fullName)},</h3>
      <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn trên <b>${SYSTEM_NAME}</b>.
      Bấm nút dưới đây để đặt mật khẩu mới (liên kết có hiệu lực ${minutes} phút và chỉ dùng được một lần):</p>
      ${linkButton(link, 'Đặt lại mật khẩu')}
      <p>Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.</p>
    `,
    text: `Xin chào ${fullName},\nMở liên kết sau để đặt lại mật khẩu ITC Care (hiệu lực ${minutes} phút, dùng một lần):\n${link}\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
  });
}

module.exports = {
  sendAccountEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  escapeHtml,
};
