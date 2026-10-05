// Trạng thái gói dịch vụ ("gói sử dụng") và xử lý đơn PayOS.
const crypto = require('crypto');
const CaiDatHeThong = require('../models/CaiDatHeThong');
const DonThanhToan = require('../models/DonThanhToan');
const NguoiDung = require('../models/NguoiDung');
const { sendInvoiceEmail } = require('./dichVuEmail');
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

let cached = null; // { value, at } — việc kiểm tra quyền truy cập chạy ở mọi request nghiệp vụ

async function loadSettings() {
  return (await CaiDatHeThong.findOne()) || CaiDatHeThong.create({});
}

/** Gói dịch vụ hiện tại; lần gọi đầu tiên trên bản cài mới sẽ bắt đầu dùng thử miễn phí. */
async function getSubscription() {
  let settings = await loadSettings();
  if (!settings.subscriptionExpiresAt) {
    // Cập nhật có điều kiện để hai request đầu tiên đồng thời không cùng bắt đầu dùng thử.
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

/** Phiên bản có cache cho việc kiểm tra quyền truy cập ở mỗi request. */
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

// Việc gia hạn chạy lần lượt để hai khoản thanh toán đến cùng lúc đều được tính.
let extendQueue = Promise.resolve();
function extendSubscription(months, planCode) {
  const run = extendQueue.then(async () => {
    const settings = await loadSettings();
    const current = settings.subscriptionExpiresAt?.getTime() || 0;
    // Gia hạn sớm thì cộng dồn vào thời gian còn lại; gia hạn muộn thì tính từ hôm nay.
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
 * Gia hạn gói riêng của một tài khoản Trưởng phòng / PHT, kích hoạt nó nếu đang chờ
 * lần thanh toán đầu, và gửi biên lai qua email.
 */
function extendAccount(order) {
  const run = extendQueue.then(async () => {
    const user = await NguoiDung.findById(order.account);
    if (!user) return null;
    const current = user.accessExpiresAt?.getTime() || 0;
    const newExpiry = addMonths(new Date(Math.max(Date.now(), current)), order.months);
    user.accessExpiresAt = newExpiry;
    user.accessPlan = order.planCode;
    if (user.status === 'awaiting_payment') user.status = 'active';
    await user.save();
    sendInvoiceEmail({ to: user.email, fullName: user.fullName, order, expiresAt: newExpiry });
    return newExpiry;
  });
  extendQueue = run.catch(() => {});
  return run;
}

/**
 * Đánh dấu đơn đã thanh toán và gia hạn gói — đúng một lần cho mỗi đơn, dù
 * webhook và đồng bộ ở trang quay về báo cùng một khoản thanh toán bao nhiêu lần.
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
  if (!claimed) return DonThanhToan.findById(order._id); // request khác đã áp dụng trước
  claimed.extendedTo =
    claimed.kind === 'account'
      ? await extendAccount(claimed)
      : await extendSubscription(claimed.months, claimed.planCode);
  await claimed.save();
  console.log(
    `[PayOS] Đơn ${orderCode} đã thanh toán, gia hạn tới ${claimed.extendedTo.toISOString()}.`,
  );
  return claimed;
}

// Mã đơn là số nguyên dương mà PayOS giữ duy nhất theo từng kênh.
const newOrderCode = () => Number(`${Date.now() % 1e10}${crypto.randomInt(100, 1000)}`);

const MAX_PLANS = 6;
const MAX_AMOUNT = 1e9;

/** Bảng giá do admin đặt, hoặc mặc định có sẵn. */
async function getPlans() {
  const settings = await loadSettings();
  const saved = settings.subscriptionPlans;
  return saved?.length
    ? saved.map(({ code, name, months, amount }) => ({ code, name, months, amount }))
    : SUBSCRIPTION_PLANS.map((p) => ({ ...p }));
}

/** Admin: thay bảng giá. Mã suy ra từ thời hạn nên phải duy nhất. */
async function savePlans(input) {
  assert(Array.isArray(input) && input.length >= 1, 'Cần ít nhất một gói');
  assert(input.length <= MAX_PLANS, `Tối đa ${MAX_PLANS} gói`);
  const plans = input.map((p) => {
    const name = typeof p?.name === 'string' ? p.name.trim() : '';
    const months = Number(p?.months);
    const amount = Number(p?.amount);
    assert(name && name.length <= 50, 'Tên gói phải có từ 1 đến 50 ký tự');
    assert(Number.isInteger(months) && months >= 1 && months <= 60, 'Số tháng phải từ 1 đến 60');
    assert(
      Number.isInteger(amount) && amount >= 2000 && amount <= MAX_AMOUNT,
      'Giá gói phải là số nguyên từ 2.000 đ',
    );
    return { code: `goi_${months}_thang`, name, months, amount };
  });
  assert(
    new Set(plans.map((p) => p.months)).size === plans.length,
    'Mỗi gói phải có số tháng khác nhau',
  );
  plans.sort((a, b) => a.months - b.months);
  const settings = await loadSettings();
  settings.subscriptionPlans = plans;
  await settings.save();
  return plans;
}

/**
 * Tạo đơn chờ thanh toán cùng link thanh toán PayOS. Với `account`, đơn thanh toán cho
 * gói riêng của tài khoản Trưởng phòng / PHT thay vì gói hệ thống dùng chung.
 */
async function createOrder(planCode, user, { account = null } = {}) {
  const plan = (await getPlans()).find((p) => p.code === planCode);
  assert(plan, 'Gói không hợp lệ');
  assert(payos.isConfigured(), 'Chưa cấu hình PayOS trên máy chủ', 503);

  const order = await DonThanhToan.create({
    orderCode: newOrderCode(),
    planCode: plan.code,
    planName: plan.name,
    months: plan.months,
    amount: plan.amount,
    createdBy: user.id,
    kind: account ? 'account' : 'system',
    account: account ? account.id : null,
  });
  const returnUrl = `${getAppUrl()}${account ? '/account-payment' : '/billing'}`;
  try {
    const link = await payos.createPaymentLink({
      orderCode: order.orderCode,
      amount: order.amount,
      // PayOS: ≤ 25 ký tự, không dấu
      description: `ITC Care ${account ? 'TK ' : ''}${plan.months} thang`,
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

/** Hỏi PayOS trạng thái thật của một đơn đang chờ và ghi lại. */
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
  getPlans,
  savePlans,
  createOrder,
  syncOrder,
};
