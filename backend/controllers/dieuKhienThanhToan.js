const DonThanhToan = require('../models/DonThanhToan');
const payos = require('../services/dichVuPayOS');
const subscription = require('../services/dichVuGoiDichVu');
const { ORDER_STATUS } = require('../utils/hangSo');
const { assert } = require('../utils/kiemTra');

const findOrder = async (orderCode) => {
  const code = Number(orderCode);
  assert(Number.isSafeInteger(code) && code > 0, 'Mã đơn không hợp lệ');
  const order = await DonThanhToan.findOne({ orderCode: code });
  assert(order, 'Không tìm thấy đơn thanh toán', 404);
  return order;
};

async function getStatus(req, res, next) {
  try {
    res.json({ ...(await subscription.getSubscription()), payosConfigured: payos.isConfigured() });
  } catch (error) {
    next(error);
  }
}

async function getPlans(req, res, next) {
  try {
    res.json(await subscription.getPlans());
  } catch (error) {
    next(error);
  }
}

async function savePlans(req, res, next) {
  try {
    res.json(await subscription.savePlans(req.body?.plans));
  } catch (error) {
    next(error);
  }
}

async function listOrders(req, res, next) {
  try {
    // Chỉ gói hệ thống dùng chung; đơn gói riêng của Trưởng phòng / PHT thuộc về tài khoản của họ.
    const orders = await DonThanhToan.find({ kind: { $ne: 'account' } })
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(orders);
  } catch (error) {
    next(error);
  }
}

async function getRevenue(req, res, next) {
  try {
    const paid = { status: ORDER_STATUS.PAID };
    const [totals, byMonth, byPlan, recent] = await Promise.all([
      DonThanhToan.aggregate([
        { $match: paid },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      DonThanhToan.aggregate([
        { $match: paid },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m',
                date: { $ifNull: ['$paidAt', '$createdAt'] },
                timezone: 'Asia/Ho_Chi_Minh',
              },
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 12 },
      ]),
      DonThanhToan.aggregate([
        { $match: paid },
        {
          $group: {
            _id: '$planName',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),
      DonThanhToan.find(paid)
        .populate('createdBy', 'fullName email')
        .sort({ paidAt: -1, createdAt: -1 })
        .limit(50),
    ]);
    res.json({
      total: totals[0]?.total || 0,
      count: totals[0]?.count || 0,
      byMonth: byMonth.map((m) => ({ month: m._id, total: m.total, count: m.count })).reverse(),
      byPlan: byPlan.map((p) => ({ plan: p._id, total: p.total, count: p.count })),
      recent,
    });
  } catch (error) {
    next(error);
  }
}

async function createOrder(req, res, next) {
  try {
    const order = await subscription.createOrder(req.body?.planCode, req.user);
    res.status(201).json({ orderCode: order.orderCode, checkoutUrl: order.checkoutUrl });
  } catch (error) {
    next(error);
  }
}

async function syncOrder(req, res, next) {
  try {
    const order = await subscription.syncOrder(await findOrder(req.params.orderCode));
    res.json({ order, subscription: await subscription.getSubscription() });
  } catch (error) {
    next(error);
  }
}

async function payosWebhook(req, res, next) {
  try {
    const data = payos.verifyWebhook(req.body);
    if (!data) return res.status(400).json({ message: 'Chữ ký không hợp lệ' });
    // Lần gọi thử "confirm webhook" của PayOS dùng đơn ta chưa từng tạo — chỉ cần xác nhận.
    if (data.code === '00' && req.body.success !== false) {
      const order = await DonThanhToan.findOne({ orderCode: Number(data.orderCode) });
      if (order && order.status === ORDER_STATUS.PENDING) {
        await subscription.applyPaidOrder(order.orderCode, {
          amount: data.amount,
          reference: data.reference,
          paidAt: data.transactionDateTime,
        });
      }
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getStatus,
  getPlans,
  savePlans,
  listOrders,
  getRevenue,
  createOrder,
  syncOrder,
  payosWebhook,
};
