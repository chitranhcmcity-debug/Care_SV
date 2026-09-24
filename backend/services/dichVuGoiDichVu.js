// Subscription ("gói sử dụng") state and PayOS order handling.
const crypto = require('crypto');
const CaiDatHeThong = require('../models/CaiDatHeThong');
const DonThanhToan = require('../models/DonThanhToan');
const payos = require('./dichVuPayOS');
const { SUBSCRIPTION_PLANS, ORDER_STATUS } = require('../utils/hangSo');
const { getAppUrl } = require('../utils/moiTruong');
const { assert } = require('../utils/kiemTra');

const DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENT_LINK_MINUTES = 15;
const CACHE_MS = 30 * 1000;

const trialDays = () => {
  const days = Number(process.env.SUBSCRIPTION_TRIAL_DAYS);
  return Number.isFinite(days) && days >= 0 ? days : 30;
};

let cached = null; // { value, at } — the access check runs on every business request

async function loadSettings() {
  return (await CaiDatHeThong.findOne()) || CaiDatHeThong.create({});
}

/** Current subscription; the first call on a new install starts the free trial. */
async function getSubscription() {
  let settings = await loadSettings();
  if (!settings.subscriptionExpiresAt) {
    // Conditional update so two concurrent first requests cannot both start a trial.
    settings =
      (await CaiDatHeThong.findOneAndUpdate(
        { _id: settings._id, subscriptionExpiresAt: null },
        {
          $set: {
            subscriptionExpiresAt: new Date(Date.now() + trialDays() * DAY_MS),
            subscriptionPlan: 'dung_thu',
          },
        },
        { new: true },
      )) || (await CaiDatHeThong.findById(settings._id));
  }
  const expiresAt = settings.subscriptionExpiresAt;
  const msLeft = expiresAt.getTime() - Date.now();
  const value = {
    expiresAt,
    plan: settings.subscriptionPlan,
    isTrial: settings.subscriptionPlan === 'dung_thu',
    active: msLeft > 0,
    daysLeft: Math.max(0, Math.ceil(msLeft / DAY_MS)),
  };
  cached = { value, at: Date.now() };
  return value;
}

/** Cached variant for the per-request access check. */
async function isSubscriptionActive() {
  if (cached && Date.now() - cached.at < CACHE_MS)
    return cached.value.expiresAt.getTime() > Date.now();
  return (await getSubscription()).active;
}

const validDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

// Subscription extensions run one at a time so two payments landing together both count.
let extendQueue = Promise.resolve();
function extendSubscription(months, planCode) {
  const run = extendQueue.then(async () => {
    const settings = await loadSettings();
    const current = settings.subscriptionExpiresAt?.getTime() || 0;
    // Renewing early stacks on the remaining time; renewing late starts from today.
    const newExpiry = addMonths(new Date(Math.max(Date.now(), current)), months);
    settings.subscriptionExpiresAt = newExpiry;
    settings.subscriptionPlan = planCode;
    await settings.save();
    cached = null;
    return newExpiry;
  });
  extendQueue = run.catch(() => {});
  return run;
}

/**
 * Marks an order paid and extends the subscription — exactly once per order, however
 * many times the webhook and the return-page sync report the same payment.
 */
async function applyPaidOrder(orderCode, { amount, reference, paidAt } = {}) {
  const order = await DonThanhToan.findOne({ orderCode });
  if (!order || order.status === ORDER_STATUS.PAID) return order;
  if (amount !== undefined && Number(amount) !== order.amount) {
    console.warn(
      `[PayOS] Đơn ${orderCode}: số tiền ${amount} khác giá đơn ${order.amount}, bỏ qua.`,
    );
    return order;
  }
  const claimed = await DonThanhToan.findOneAndUpdate(
    { _id: order._id, status: { $ne: ORDER_STATUS.PAID } },
    {
      $set: {
        status: ORDER_STATUS.PAID,
        paidAt: validDate(paidAt) || new Date(),
        reference: reference || '',
      },
    },
    { new: true },
  );
  if (!claimed) return DonThanhToan.findById(order._id); // another request applied it first
  claimed.extendedTo = await extendSubscription(claimed.months, claimed.planCode);
  await claimed.save();
  console.log(
    `[PayOS] Đơn ${orderCode} đã thanh toán, gia hạn tới ${claimed.extendedTo.toISOString()}.`,
  );
  return claimed;
}

// Order codes are positive integers PayOS keeps unique per channel.
const newOrderCode = () => Number(`${Date.now() % 1e10}${crypto.randomInt(100, 1000)}`);

/** Creates a pending order plus its PayOS payment link. */
async function createOrder(planCode, user) {
  const plan = SUBSCRIPTION_PLANS.find((p) => p.code === planCode);
  assert(plan, 'Gói không hợp lệ');
  assert(payos.isConfigured(), 'Chưa cấu hình PayOS trên máy chủ', 503);

  const order = await DonThanhToan.create({
    orderCode: newOrderCode(),
    planCode: plan.code,
    planName: plan.name,
    months: plan.months,
    amount: plan.amount,
    createdBy: user.id,
  });
  const returnUrl = `${getAppUrl()}/billing`;
  try {
    const link = await payos.createPaymentLink({
      orderCode: order.orderCode,
      amount: order.amount,
      description: `ITC Care ${plan.months} thang`, // PayOS: ≤ 25 chars, no accents
      returnUrl,
      cancelUrl: returnUrl,
      items: [{ name: plan.name, quantity: 1, price: plan.amount }],
      expiredAt: Math.floor(Date.now() / 1000) + PAYMENT_LINK_MINUTES * 60,
    });
    order.checkoutUrl = link.checkoutUrl;
    order.paymentLinkId = link.paymentLinkId || '';
    await order.save();
    return order;
  } catch (error) {
    await order.deleteOne();
    throw error;
  }
}

const PAYOS_FINAL_STATUS = { CANCELLED: ORDER_STATUS.CANCELLED, EXPIRED: ORDER_STATUS.EXPIRED };

/** Asks PayOS for the real state of a pending order and records it. */
async function syncOrder(order) {
  if (order.status !== ORDER_STATUS.PENDING) return order;
  const info = await payos.getPaymentInfo(order.orderCode);
  if (info.status === 'PAID') {
    const tx = info.transactions?.[0];
    return applyPaidOrder(order.orderCode, {
      amount: info.amountPaid ?? info.amount,
      reference: tx?.reference,
      paidAt: tx?.transactionDateTime,
    });
  }
  if (PAYOS_FINAL_STATUS[info.status]) {
    order.status = PAYOS_FINAL_STATUS[info.status];
    await order.save();
  }
  return order;
}

module.exports = {
  getSubscription,
  isSubscriptionActive,
  applyPaidOrder,
  createOrder,
  syncOrder,
};
