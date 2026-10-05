const express = require('express');
const router = express.Router();
const { verifyToken, requirePermission } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienThongKe');

// GET /api/analytics/summary
router.get('/summary', verifyToken, requirePermission('reports.view'), ctrl.getSummary);

// GET /api/analytics/export-care-report
router.get(
  '/export-care-report',
  verifyToken,
  requirePermission('reports.view'),
  ctrl.exportCareReport,
);

module.exports = router;
