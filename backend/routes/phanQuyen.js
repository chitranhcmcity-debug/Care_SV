const express = require('express');
const router = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienPhanQuyen');

router.use(verifyToken, requireAdmin);

// GET /api/permissions (Admin) — permission catalogue, roles, defaults and the current matrix.
router.get('/', ctrl.getMatrix);

// PUT /api/permissions (Admin) — body { matrix: { manager: [key], staff: [key], teacher: [key] } }.
// Takes effect on the next request of each user; no one has to sign in again.
router.put('/', ctrl.updateMatrix);

module.exports = router;
