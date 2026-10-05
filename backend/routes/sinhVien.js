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

// GET /api/students (Admin, Trưởng phòng/Phó hiệu trưởng) — every student's record.
router.get('/', verifyToken, requirePermission('students.view'), ctrl.list);

// GET /api/students/classes (Admin, Trưởng phòng) — class codes for the filter dropdown.
router.get('/classes', verifyToken, requirePermission('students.view'), ctrl.listClasses);

// POST /api/students (quyền excel.import — quản lý dữ liệu sinh viên) — add one student.
router.post('/', verifyToken, requirePermission('excel.import'), ctrl.create);

// PUT /api/students/:id — edit a student's details.
router.put('/:id', verifyToken, requirePermission('excel.import'), ctrl.update);

// DELETE /api/students/:id — removes the student with their course memberships, attendance
// marks, call tasks and call logs (including recording files).
router.delete('/:id', verifyToken, requirePermission('excel.import'), ctrl.remove);

// GET /api/students/:studentId/profile — 360° timeline: absences, care cases and calls.
router.get(
  '/:studentId/profile',
  verifyToken,
  requireSignedIn,
  requireStudentAccess,
  ctrl.getProfile,
);

// PUT /api/students/:studentId/tags — body { tags: string[] }.
router.put(
  '/:studentId/tags',
  verifyToken,
  requireOperator,
  requireStudentAccess,
  ctrl.updateTags,
);

module.exports = router;
