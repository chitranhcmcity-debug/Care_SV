const express = require('express');
const router = express.Router();
const {
  verifyToken,
  requireAdmin,
  requireSignedIn,
  requirePermission,
} = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienCaiDat');

// GET /api/settings/branding (public) — name, logo and colour for the login page and app shell.
router.get('/branding', ctrl.getBranding);

// GET /api/settings (every signed-in user)
router.get('/', verifyToken, requireSignedIn, ctrl.getSettings);

// PUT /api/settings (Admin) — system identity and web interface.
router.put('/', verifyToken, requireAdmin, ctrl.updateSystem);

// PUT /api/settings/care (Trưởng phòng / PHT: warnings.configure) — warning levels and care lists.
router.put('/care', verifyToken, requirePermission('warnings.configure'), ctrl.updateCare);

// GET /api/settings/integrations (Admin) — API keys, secrets masked.
router.get('/integrations', verifyToken, requireAdmin, ctrl.getIntegrations);

// PUT /api/settings/integrations (Admin) — body { values: { KEY: 'value' | '' } }.
router.put('/integrations', verifyToken, requireAdmin, ctrl.saveIntegrations);

module.exports = router;
