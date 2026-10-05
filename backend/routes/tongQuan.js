const express = require('express');
const router = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienTongQuan');

// GET /api/overview (Admin) — sức khỏe hệ thống trong một cái nhìn. Gắn bên ngoài khóa gói dịch vụ
// để admin vẫn thấy (cùng trạng thái gia hạn) sau khi gói hết hạn.
router.get('/', verifyToken, requireAdmin, ctrl.getOverview);

module.exports = router;
