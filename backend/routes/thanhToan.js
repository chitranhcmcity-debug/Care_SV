const express = require('express');
const router = express.Router();
const {
  verifyToken,
  requireAdmin,
  requireSignedIn,
  requireRoles,
} = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienThanhToan');

// Admin đặt giá; Trưởng phòng / PHT mua gói cho cả hệ thống.
const requireBuyer = requireRoles('manager');
const requireBillingViewer = requireRoles('admin', 'manager');

// GET /api/billing/status (mọi người dùng đã đăng nhập) — dùng cho banner sắp hết hạn.
router.get('/status', verifyToken, requireSignedIn, ctrl.getStatus);

// GET /api/billing/plans (Admin, Trưởng phòng / PHT)
router.get('/plans', verifyToken, requireBillingViewer, ctrl.getPlans);

// PUT /api/billing/plans (Admin) — body: { plans: [{ name, months, amount }] }
router.put('/plans', verifyToken, requireAdmin, ctrl.savePlans);

// GET /api/billing/orders (Admin, Trưởng phòng / PHT) — lịch sử thanh toán, mới nhất trước.
router.get('/orders', verifyToken, requireBillingViewer, ctrl.listOrders);

// GET /api/billing/revenue (Admin) — doanh thu từ mọi đơn đã thanh toán (hệ thống + tài khoản trưởng phòng).
router.get('/revenue', verifyToken, requireAdmin, ctrl.getRevenue);

// POST /api/billing/orders (Trưởng phòng / PHT) — tạo link thanh toán PayOS cho một gói.
router.post('/orders', verifyToken, requireBuyer, ctrl.createOrder);

// POST /api/billing/orders/:orderCode/sync (Admin, Trưởng phòng / PHT)
// Gọi khi PayOS chuyển hướng về, và bởi nút "Kiểm tra lại". Hỏi thẳng PayOS,
// nên vẫn chạy được cả khi PayOS không gọi tới webhook của ta (vd localhost).
router.post('/orders/:orderCode/sync', verifyToken, requireBillingViewer, ctrl.syncOrder);

// POST /api/billing/payos-webhook (công khai, PayOS → ta). Chỉ tin cậy nếu chữ ký
// khớp khóa checksum của ta. Luôn trả 200 với lời gọi đúng định dạng để PayOS ngừng gọi lại.
router.post('/payos-webhook', ctrl.payosWebhook);

module.exports = router;
