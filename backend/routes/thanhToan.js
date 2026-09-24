const express = require('express');
const router = express.Router();
const DonThanhToan = require('../models/DonThanhToan');
const payos = require('../services/dichVuPayOS');
const subscription = require('../services/dichVuGoiDichVu');
const { SUBSCRIPTION_PLANS, ORDER_STATUS } = require('../utils/hangSo');
const { assert } = require('../utils/kiemTra');
const { verifyToken, requireAdmin, requireSignedIn } = require('../middleware/xacThuc');

const findOrder = async (orderCode) => {
  const code = Number(orderCode);
  assert(Number.isSafeInteger(code) && code > 0, 'Mã đơn không hợp lệ');
  const order = await DonThanhToan.findOne({ orderCode: code });
  assert(order, 'Không tìm thấy đơn thanh toán', 404);
  return order;
};

// GET /api/billing/status (any signed-in user) — drives the expiry banner.
router.get('/status', verifyToken, requireSignedIn, async (req, res, next) => {
  try {
    res.json({ ...(await subscription.getSubscription()), payosConfigured: payos.isConfigured() });
  } catch (error) {
    next(error);
  }
});

// GET /api/billing/plans (Admin)
router.get('/plans', verifyToken, requireAdmin, (req, res) => {
  res.json(SUBSCRIPTION_PLANS);
});

// GET /api/billing/orders (Admin) — payment history, newest first.
router.get('/orders', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const orders = await DonThanhToan.find()
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

// POST /api/billing/orders (Admin) — creates a PayOS payment link for a plan.
router.post('/orders', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const order = await subscription.createOrder(req.body?.planCode, req.user);
    res.status(201).json({ orderCode: order.orderCode, checkoutUrl: order.checkoutUrl });
  } catch (error) {
    next(error);
  }
});

// POST /api/billing/orders/:orderCode/sync (Admin)
// Called when PayOS redirects back, and by the "Kiểm tra lại" button. Asks PayOS directly,
// so it works even where PayOS cannot reach our webhook (e.g. localhost).
router.post('/orders/:orderCode/sync', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const order = await subscription.syncOrder(await findOrder(req.params.orderCode));
    res.json({ order, subscription: await subscription.getSubscription() });
  } catch (error) {
    next(error);
  }
});

// POST /api/billing/payos-webhook (Public, PayOS → us). Trusted only if the signature
// matches our checksum key. Always 200 for well-formed calls so PayOS stops retrying.
router.post('/payos-webhook', async (req, res, next) => {
  try {
    const data = payos.verifyWebhook(req.body);
    if (!data) return res.status(400).json({ message: 'Chữ ký không hợp lệ' });
    // PayOS's "confirm webhook" test call uses an order we never created — just acknowledge.
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
});

module.exports = router;
