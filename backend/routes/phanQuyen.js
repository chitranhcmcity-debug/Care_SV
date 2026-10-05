const express = require('express');
const router = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienPhanQuyen');

router.use(verifyToken, requireAdmin);

// GET /api/permissions (Admin) — danh mục quyền, vai trò, giá trị mặc định và ma trận hiện tại.
router.get('/', ctrl.getMatrix);

// PUT /api/permissions (Admin) — body { matrix: { manager: [key], staff: [key], teacher: [key] } }.
// Có hiệu lực ở request kế tiếp của mỗi người dùng; không ai phải đăng nhập lại.
router.put('/', ctrl.updateMatrix);

module.exports = router;
