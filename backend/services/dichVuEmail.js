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

const SENDER_NAME = 'Hệ thống Quản lý ITC Care';

// Brevo's HTTP API goes out over 443, so it works on hosts that block SMTP ports (e.g. Railway).
async function deliverViaBrevo({ to, subject, html, text }) {
  const sender = process.env.MAIL_FROM || process.env.SMTP_USER;
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: sender },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    console.log(`[Email] Đã gửi "${subject}" tới ${to} (Brevo).`);
    return true;
  } catch (error) {
    console.warn(`[Email] Gửi email tới ${to} qua Brevo thất bại:`, error.message);
    return false;
  }
}

// Cloudflare Email Service REST API (also over 443). Sending to arbitrary recipients needs the
// Workers Paid plan, and MAIL_FROM must be on a domain onboarded to Email Service.
async function deliverViaCloudflare({ to, subject, html, text }) {
  const { CF_ACCOUNT_ID, CF_EMAIL_API_TOKEN, MAIL_FROM } = process.env;
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CF_ACCOUNT_ID)}/email/sending/send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${CF_EMAIL_API_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ to, from: MAIL_FROM, subject, html, text }),
        signal: AbortSignal.timeout(15000),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success || payload.result?.permanent_bounces?.length) {
      throw new Error(
        `HTTP ${response.status}: ${JSON.stringify(payload.errors || payload.result)}`,
      );
    }
    console.log(`[Email] Đã gửi "${subject}" tới ${to} (Cloudflare).`);
    return true;
  } catch (error) {
    console.warn(`[Email] Gửi email tới ${to} qua Cloudflare thất bại:`, error.message);
    return false;
  }
}

// Resend HTTP API (over 443). MAIL_FROM must be on a domain verified in Resend.
async function deliverViaResend({ to, subject, html, text }) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: `${SENDER_NAME} <${process.env.MAIL_FROM}>`,
        to: [to],
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    console.log(`[Email] Đã gửi "${subject}" tới ${to} (Resend).`);
    return true;
  } catch (error) {
    console.warn(`[Email] Gửi email tới ${to} qua Resend thất bại:`, error.message);
    return false;
  }
}

/**
 * Sends one email. Never throws: returns true when the provider accepted it,
 * false when email is not configured or delivery failed.
 * Provider order: Resend, Cloudflare Email Service, Brevo, then SMTP (nodemailer).
 */
async function deliver({ to, subject, html, text }) {
  const { RESEND_API_KEY, CF_ACCOUNT_ID, CF_EMAIL_API_TOKEN, MAIL_FROM } = process.env;
  if (RESEND_API_KEY && MAIL_FROM) return deliverViaResend({ to, subject, html, text });
  if (CF_ACCOUNT_ID && CF_EMAIL_API_TOKEN && MAIL_FROM)
    return deliverViaCloudflare({ to, subject, html, text });
  if (process.env.BREVO_API_KEY) return deliverViaBrevo({ to, subject, html, text });
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[Email] SMTP chưa cấu hình, không gửi được email tới ${to}.`);
    return false;
  }
  try {
    await transporter.sendMail({
      from: `"${SENDER_NAME}" <${process.env.SMTP_USER}>`,
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

/** Tells a Trưởng phòng / PHT that a new account is waiting for their approval. */
function sendApprovalRequestEmail({ to, managerName, applicant }) {
  const link = `${getAppUrl()}/account-approvals?id=${encodeURIComponent(applicant.id)}`;
  const roleLabel = ROLE_LABEL[applicant.role] || '';
  return deliver({
    to,
    subject: `[ITC Care] Yêu cầu duyệt tài khoản mới: ${applicant.fullName}`,
    html: `
      <h3>Xin chào ${escapeHtml(managerName)},</h3>
      <p>Có tài khoản mới đăng ký trên <b>${SYSTEM_NAME}</b> đang chờ bạn xác nhận:</p>
      <ul>
        <li><b>Họ tên:</b> ${escapeHtml(applicant.fullName)}</li>
        <li><b>Email:</b> ${escapeHtml(applicant.email)}</li>
        <li><b>Vai trò:</b> ${roleLabel}</li>
      </ul>
      <p>Khi bạn xác nhận, hệ thống sẽ gửi key kích hoạt vào email của người đăng ký.</p>
      ${linkButton(link, 'Xem và xác nhận')}
      <p>Nếu bạn không biết người này, hãy bấm Từ chối trong trang duyệt tài khoản.</p>
    `,
    text: `Xin chào ${managerName},\nTài khoản mới đang chờ bạn xác nhận:\nHọ tên: ${applicant.fullName}\nEmail: ${applicant.email}\nVai trò: ${roleLabel}\nMở trang sau để xác nhận hoặc từ chối:\n${link}`,
  });
}

/** Activation key for a self-registered account a manager has approved. */
function sendActivationKeyEmail({ to, fullName, role, key, approvedBy, days }) {
  const link = `${getAppUrl()}/login`;
  return deliver({
    to,
    subject: '[ITC Care] Key kích hoạt tài khoản',
    html: `
      <h3>Xin chào ${escapeHtml(fullName)},</h3>
      <p>Tài khoản <b>${ROLE_LABEL[role] || ''}</b> của bạn trên <b>${SYSTEM_NAME}</b> đã được
      <b>${escapeHtml(approvedBy)}</b> xác nhận. Key kích hoạt của bạn:</p>
      <p style="font-size:22px;font-weight:700;letter-spacing:2px;font-family:monospace;background:#f3e8ff;color:#5b21b6;padding:12px 18px;border-radius:10px;display:inline-block">${escapeHtml(key)}</p>
      <p>Đăng nhập bằng email và mật khẩu đã đăng ký, rồi dán key này khi được hỏi
      (key có hiệu lực ${days} ngày và chỉ dùng một lần).</p>
      ${linkButton(link, 'Đăng nhập')}
    `,
    text: `Xin chào ${fullName},\nTài khoản ITC Care của bạn đã được ${approvedBy} xác nhận.\nKey kích hoạt: ${key}\nĐăng nhập tại ${link} rồi dán key khi được hỏi (hiệu lực ${days} ngày, dùng một lần).`,
  });
}

/** Tells an applicant their sign-up was declined. */
function sendRegistrationRejectedEmail({ to, fullName }) {
  return deliver({
    to,
    subject: '[ITC Care] Đăng ký tài khoản không được chấp nhận',
    html: `
      <h3>Xin chào ${escapeHtml(fullName)},</h3>
      <p>Yêu cầu đăng ký tài khoản của bạn trên <b>${SYSTEM_NAME}</b> không được Trưởng phòng /
      Phó hiệu trưởng chấp nhận. Nếu có nhầm lẫn, vui lòng liên hệ quản lý của bạn.</p>
    `,
    text: `Xin chào ${fullName},\nYêu cầu đăng ký tài khoản ITC Care của bạn không được chấp nhận. Nếu có nhầm lẫn, vui lòng liên hệ quản lý của bạn.`,
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

const formatVnd = (amount) => `${Number(amount).toLocaleString('vi-VN')} đ`;
const formatDate = (date) =>
  new Date(date).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const formatDay = (date) =>
  new Date(date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

/** Receipt for a Trưởng phòng / PHT account plan, sent once the payment is confirmed. */
function sendInvoiceEmail({ to, fullName, order, expiresAt }) {
  const rows = [
    ['Mã đơn', order.orderCode],
    ['Gói dịch vụ', order.planName],
    ['Thời hạn', `${order.months} tháng`],
    ['Số tiền', formatVnd(order.amount)],
    ['Thanh toán lúc', formatDate(order.paidAt || Date.now())],
    ['Mã giao dịch', order.reference || '—'],
    ['Hiệu lực tài khoản đến', formatDay(expiresAt)],
  ];
  const link = `${getAppUrl()}/login`;
  return deliver({
    to,
    subject: `[ITC Care] Hóa đơn thanh toán #${order.orderCode}`,
    html: `
      <h3>Xin chào ${escapeHtml(fullName)},</h3>
      <p>Cảm ơn bạn đã thanh toán gói dịch vụ trên <b>${SYSTEM_NAME}</b>. Tài khoản Trưởng phòng /
      Phó hiệu trưởng của bạn đã được kích hoạt.</p>
      <table style="border-collapse:collapse;min-width:320px;font-size:14px">
        ${rows
          .map(
            ([label, value]) =>
              `<tr><td style="padding:8px 12px;border:1px solid #e9e3f7;background:#f8f5ff;color:#5b21b6;font-weight:600">${label}</td><td style="padding:8px 12px;border:1px solid #e9e3f7">${escapeHtml(value)}</td></tr>`,
          )
          .join('')}
      </table>
      ${linkButton(link, 'Đăng nhập')}
      <p style="color:#64748b;font-size:13px">Hãy giữ email này làm chứng từ thanh toán.</p>
    `,
    text: [
      `Xin chào ${fullName},`,
      'Hóa đơn thanh toán gói dịch vụ ITC Care:',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      `Đăng nhập: ${link}`,
    ].join('\n'),
  });
}

/** Before (expired = false) or on (expired = true) the end of an account's own plan. */
function sendRenewalEmail({ to, fullName, expiresAt, renewUrl, expired }) {
  const day = formatDay(expiresAt);
  const intro = expired
    ? `Gói dịch vụ của tài khoản Trưởng phòng / Phó hiệu trưởng trên <b>${SYSTEM_NAME}</b> đã hết hạn ngày <b>${day}</b>. Tài khoản tạm khóa cho tới khi được gia hạn.`
    : `Gói dịch vụ của tài khoản Trưởng phòng / Phó hiệu trưởng trên <b>${SYSTEM_NAME}</b> sẽ hết hạn ngày <b>${day}</b>.`;
  return deliver({
    to,
    subject: expired
      ? '[ITC Care] Tài khoản đã hết hạn — gia hạn để tiếp tục sử dụng'
      : `[ITC Care] Gói dịch vụ sắp hết hạn (${day})`,
    html: `
      <h3>Xin chào ${escapeHtml(fullName)},</h3>
      <p>${intro}</p>
      <p>Bấm nút dưới đây để chọn gói và chuyển khoản. Thanh toán xong, tài khoản được kích hoạt
      lại ngay và hóa đơn sẽ gửi về email này.</p>
      ${linkButton(renewUrl, 'Gia hạn ngay')}
    `,
    text: `Xin chào ${fullName},\n${
      expired
        ? `Gói dịch vụ tài khoản ITC Care của bạn đã hết hạn ngày ${day}.`
        : `Gói dịch vụ tài khoản ITC Care của bạn sẽ hết hạn ngày ${day}.`
    }\nGia hạn tại: ${renewUrl}`,
  });
}

module.exports = {
  sendInvoiceEmail,
  sendRenewalEmail,
  sendAccountEmail,
  sendApprovalRequestEmail,
  sendActivationKeyEmail,
  sendRegistrationRejectedEmail,
  sendPasswordResetEmail,
  escapeHtml,
};
