const express = require('express');
const router = express.Router();
const { verifyToken, requireSignedIn } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienThongBao');

router.use(verifyToken, requireSignedIn);

// GET /api/notifications
router.get('/', ctrl.getSummary);

// PUT /api/notifications/seen — body { scope?: 'care' | 'tasks' }; không có scope = chuông thông báo,
// đánh dấu mọi loại là đã xem.
router.put('/seen', ctrl.markSeen);

module.exports = router;
