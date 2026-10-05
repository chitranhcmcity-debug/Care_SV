const express = require('express');
const router = express.Router();
const {
  verifyToken,
  requirePermission,
  requireSignedIn,
  requireOperator,
} = require('../middleware/xacThuc');
const { requireStudentAccess } = require('../middleware/phanQuyen');
const ctrl = require('../controllers/dieuKhienSinhVien');

// GET /api/students (Admin, Trưởng phòng/Phó hiệu trưởng) — hồ sơ của mọi sinh viên.
router.get('/', verifyToken, requirePermission('students.view'), ctrl.list);

// GET /api/students/classes (Admin, Trưởng phòng) — mã lớp cho dropdown lọc.
router.get('/classes', verifyToken, requirePermission('students.view'), ctrl.listClasses);

// POST /api/students (quyền excel.import — quản lý dữ liệu sinh viên) — thêm một sinh viên.
router.post('/', verifyToken, requirePermission('excel.import'), ctrl.create);

// PUT /api/students/:id — sửa thông tin sinh viên.
router.put('/:id', verifyToken, requirePermission('excel.import'), ctrl.update);

// DELETE /api/students/:id — xóa sinh viên cùng các học phần đã đăng ký, điểm danh,
// nhiệm vụ gọi và nhật ký cuộc gọi (kể cả file ghi âm).
router.delete('/:id', verifyToken, requirePermission('excel.import'), ctrl.remove);

// GET /api/students/:studentId/profile — dòng thời gian 360°: vắng học, hồ sơ chăm sóc và cuộc gọi.
router.get(
  '/:studentId/profile',
  verifyToken,
  requireSignedIn,
  requireStudentAccess,
  ctrl.getProfile,
);

// PUT /api/students/:studentId/tags — body { tags: string[] }.
router.put('/:studentId/tags', verifyToken, requireOperator, requireStudentAccess, ctrl.updateTags);

module.exports = router;
