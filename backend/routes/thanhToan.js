const express = require('express');
const router = express.Router();
const {
  verifyToken,
  requireAdmin,
  requireSignedIn,
  requireRoles,
} = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienThanhToan');

// The admin sets the prices; a Trưởng phòng / PHT buys the plan for the whole system.
const requireBuyer = requireRoles('manager');
const requireBillingViewer = requireRoles('admin', 'manager');

// GET /api/billing/status (any signed-in user) — drives the expiry banner.
router.get('/status', verifyToken, requireSignedIn, ctrl.getStatus);

// GET /api/billing/plans (Admin, Trưởng phòng / PHT)
router.get('/plans', verifyToken, requireBillingViewer, ctrl.getPlans);

// PUT /api/billing/plans (Admin) — body: { plans: [{ name, months, amount }] }
router.put('/plans', verifyToken, requireAdmin, ctrl.savePlans);

// GET /api/billing/orders (Admin, Trưởng phòng / PHT) — payment history, newest first.
router.get('/orders', verifyToken, requireBillingViewer, ctrl.listOrders);

// GET /api/billing/revenue (Admin) — revenue from every paid order (system + manager accounts).
router.get('/revenue', verifyToken, requireAdmin, ctrl.getRevenue);

// POST /api/billing/orders (Trưởng phòng / PHT) — creates a PayOS payment link for a plan.
router.post('/orders', verifyToken, requireBuyer, ctrl.createOrder);

// POST /api/billing/orders/:orderCode/sync (Admin, Trưởng phòng / PHT)
// Called when PayOS redirects back, and by the "Kiểm tra lại" button. Asks PayOS directly,
// so it works even where PayOS cannot reach our webhook (e.g. localhost).
router.post('/orders/:orderCode/sync', verifyToken, requireBillingViewer, ctrl.syncOrder);

// POST /api/billing/payos-webhook (Public, PayOS → us). Trusted only if the signature
// matches our checksum key. Always 200 for well-formed calls so PayOS stops retrying.
router.post('/payos-webhook', ctrl.payosWebhook);

module.exports = router;
