// Own plans of self-registered Trưởng phòng / PHT accounts: renewal links and expiry reminders.
const jwt = require('jsonwebtoken');
const NguoiDung = require('../models/NguoiDung');
const { sendRenewalEmail } = require('./dichVuEmail');
const { getJwtSecret, getAppUrl } = require('../utils/moiTruong');

const DAY_MS = 24 * 60 * 60 * 1000;
const REMIND_DAYS_BEFORE = 3;
const RENEW_LINK_DAYS = 30;
const CHECK_EVERY_MS = 60 * 60 * 1000;

// A separate secret, so a renewal link can never be used as a sign-in token (and vice versa).
const renewSecret = () => `${getJwtSecret()}:account-renewal`;

/** Link that lets the account holder pick a plan and pay without signing in. */
function renewUrl(user) {
  const token = jwt.sign({ id: String(user._id), purpose: 'renew' }, renewSecret(), {
    algorithm: 'HS256',
    expiresIn: `${RENEW_LINK_DAYS}d`,
  });
  return `${getAppUrl()}/renew?token=${encodeURIComponent(token)}`;
}

/** The account a renewal link belongs to, or null when the link is invalid or expired. */
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

/** True when this account has its own plan and that plan has run out. */
const accountExpired = (user) =>
  Boolean(user?.accessExpiresAt) && new Date(user.accessExpiresAt).getTime() <= Date.now();

/**
 * Sends each reminder once per expiry date: one a few days before the plan ends, one when it
 * has ended. Renewing moves the expiry date, which arms both reminders again.
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
      // Retried on the next check when the email could not be sent.
      if (sent) await NguoiDung.updateOne({ _id: user._id }, { [field]: user.accessExpiresAt });
    }
  }
}

/** Checks for due reminders now and then every hour. */
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
