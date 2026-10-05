// Gói riêng của tài khoản Trưởng phòng / PHT tự đăng ký: link gia hạn và nhắc hết hạn.
const jwt = require('jsonwebtoken');
const NguoiDung = require('../models/NguoiDung');
const { sendRenewalEmail } = require('./dichVuEmail');
const { getJwtSecret, getAppUrl } = require('../utils/moiTruong');

const DAY_MS = 24 * 60 * 60 * 1000;
const REMIND_DAYS_BEFORE = 3;
const RENEW_LINK_DAYS = 30;
const CHECK_EVERY_MS = 60 * 60 * 1000;

// Một bí mật riêng, để link gia hạn không bao giờ dùng được làm token đăng nhập (và ngược lại).
const renewSecret = () => `${getJwtSecret()}:account-renewal`;

/** Link cho phép chủ tài khoản chọn gói và thanh toán mà không cần đăng nhập. */
function renewUrl(user) {
  const token = jwt.sign({ id: String(user._id), purpose: 'renew' }, renewSecret(), {
    algorithm: 'HS256',
    expiresIn: `${RENEW_LINK_DAYS}d`,
  });
  return `${getAppUrl()}/renew?token=${encodeURIComponent(token)}`;
}

/** Tài khoản mà link gia hạn thuộc về, hoặc null khi link không hợp lệ hay đã hết hạn. */
async function accountFromRenewToken(token) {
  if (typeof token !== 'string' || !token) return null;
  try {
    const decoded = jwt.verify(token, renewSecret(), { algorithms: ['HS256'] });
    if (decoded.purpose !== 'renew' || !/^[a-f\d]{24}$/i.test(decoded.id)) return null;
    const user = await NguoiDung.findById(decoded.id);
    return user && user.role === 'manager' && ['active', 'awaiting_payment'].includes(user.status)
      ? user
      : null;
  } catch {
    return null;
  }
}

/** Đúng khi tài khoản này có gói riêng và gói đó đã hết. */
const accountExpired = (user) =>
  Boolean(user?.accessExpiresAt) && new Date(user.accessExpiresAt).getTime() <= Date.now();

/**
 * Gửi mỗi lời nhắc một lần cho mỗi ngày hết hạn: một lần vài ngày trước khi gói kết thúc, một lần khi
 * đã kết thúc. Gia hạn làm dời ngày hết hạn, nên cả hai lời nhắc được kích hoạt lại.
 */
async function sendDueReminders() {
  const now = new Date();
  const soon = new Date(now.getTime() + REMIND_DAYS_BEFORE * DAY_MS);
  const base = { role: 'manager', status: 'active', accessExpiresAt: { $ne: null } };
  const expiring = await NguoiDung.find({
    ...base,
    accessExpiresAt: { $gt: now, $lte: soon },
    $expr: { $ne: ['$renewalReminderFor', '$accessExpiresAt'] },
  });
  const expired = await NguoiDung.find({
    ...base,
    accessExpiresAt: { $lte: now },
    $expr: { $ne: ['$expiredNoticeFor', '$accessExpiresAt'] },
  });
  for (const [users, isExpired, field] of [
    [expiring, false, 'renewalReminderFor'],
    [expired, true, 'expiredNoticeFor'],
  ]) {
    for (const user of users) {
      const sent = await sendRenewalEmail({
        to: user.email,
        fullName: user.fullName,
        expiresAt: user.accessExpiresAt,
        renewUrl: renewUrl(user),
        expired: isExpired,
      });
      // Thử lại ở lần kiểm tra sau khi email không gửi được.
      if (sent) await NguoiDung.updateOne({ _id: user._id }, { [field]: user.accessExpiresAt });
    }
  }
}

/** Kiểm tra lời nhắc đến hạn ngay bây giờ và sau đó mỗi giờ. */
function startRenewalReminders() {
  const run = () =>
    sendDueReminders().catch((error) =>
      console.warn('[Gia hạn] Không gửi được email nhắc gia hạn:', error.message),
    );
  run();
  setInterval(run, CHECK_EVERY_MS).unref();
}

module.exports = {
  renewUrl,
  accountFromRenewToken,
  accountExpired,
  sendDueReminders,
  startRenewalReminders,
};
