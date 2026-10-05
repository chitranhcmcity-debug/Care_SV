const express = require('express');
const router = express.Router();
const {
  verifyToken,
  requireAdmin,
  requireSignedIn,
  requirePermission,
} = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienCaiDat');

// GET /api/settings/branding (công khai) — tên, logo và màu cho trang đăng nhập và khung ứng dụng.
router.get('/branding', ctrl.getBranding);

// GET /api/settings (mọi người dùng đã đăng nhập)
router.get('/', verifyToken, requireSignedIn, ctrl.getSettings);

// PUT /api/settings (Admin) — nhận diện hệ thống và giao diện web.
router.put('/', verifyToken, requireAdmin, ctrl.updateSystem);

// PUT /api/settings/care (Trưởng phòng / PHT: warnings.configure) — mức cảnh báo và danh sách chăm sóc.
router.put('/care', verifyToken, requirePermission('warnings.configure'), ctrl.updateCare);

// GET /api/settings/integrations (Admin) — các khóa API, bí mật được che đi.
router.get('/integrations', verifyToken, requireAdmin, ctrl.getIntegrations);

// PUT /api/settings/integrations (Admin) — body { values: { KEY: 'giá trị' | '' } }.
router.put('/integrations', verifyToken, requireAdmin, ctrl.saveIntegrations);

module.exports = router;
