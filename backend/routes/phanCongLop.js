const express = require('express');
const router = express.Router();
const { verifyToken, requirePermission } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienPhanCongLop');

// Ai giám sát công việc chăm sóc đều được xem (admin xem được); thay đổi cần quyền classes.assign.
const canRead = requirePermission('classes.assign', 'care.manage');
const canWrite = requirePermission('classes.assign');
router.use(verifyToken);

// GET /api/class-assignments — mọi lớp sinh hoạt kèm nhân viên hiện phụ trách, cùng
// khối lượng của nhân viên (hồ sơ chăm sóc đang mở) và số hồ sơ đang chờ chỉ đạo.
router.get('/', canRead, ctrl.listAssignments);

// GET /api/class-assignments/history?classCode=&staffId= — lịch sử phân công, mới nhất trước.
router.get('/history', canRead, ctrl.listHistory);

// PUT /api/class-assignments/:classCode — body { staffId } (null/'' = thu hồi phân công).
router.put('/:classCode', canWrite, ctrl.assign);

// POST /api/class-assignments/transfer — body { fromStaffId, toStaffId, classCodes? } bàn giao
// (mặc định toàn bộ lớp) từ nhân viên này sang nhân viên khác.
router.post('/transfer', canWrite, ctrl.transfer);

module.exports = router;
