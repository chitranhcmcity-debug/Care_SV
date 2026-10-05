const express = require('express');
const router = express.Router();
const { verifyToken, requirePermission } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienPhanCongLop');

// Reading is open to anyone who oversees care work (admin can view); changes need classes.assign.
const canRead = requirePermission('classes.assign', 'care.manage');
const canWrite = requirePermission('classes.assign');
router.use(verifyToken);

// GET /api/class-assignments — every administrative class with its current staff, plus staff
// workload (open care cases) and how many cases wait for a directive.
router.get('/', canRead, ctrl.listAssignments);

// GET /api/class-assignments/history?classCode=&staffId= — assignment history, newest first.
router.get('/history', canRead, ctrl.listHistory);

// PUT /api/class-assignments/:classCode — body { staffId } (null/'' = thu hồi phân công).
router.put('/:classCode', canWrite, ctrl.assign);

// POST /api/class-assignments/transfer — body { fromStaffId, toStaffId, classCodes? } bàn giao
// (mặc định toàn bộ lớp) từ nhân viên này sang nhân viên khác.
router.post('/transfer', canWrite, ctrl.transfer);

module.exports = router;
