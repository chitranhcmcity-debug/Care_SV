const express = require('express');
const router = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienTongQuan');

// GET /api/overview (Admin) — system health at a glance. Mounted outside the subscription lock
// so the admin still sees it (and the renewal state) after the subscription expires.
router.get('/', verifyToken, requireAdmin, ctrl.getOverview);

module.exports = router;
