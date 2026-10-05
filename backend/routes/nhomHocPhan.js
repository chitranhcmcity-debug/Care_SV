const express = require('express');
const router = express.Router();
const { verifyToken, requirePermission, requireSignedIn } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienNhomHocPhan');

const manage = [verifyToken, requirePermission('courses.manage')];

// GET /api/course-groups/timetable (mọi vai trò) — chỉ có lịch học, không có dữ liệu cá nhân của sinh viên.
router.get('/timetable', verifyToken, requireSignedIn, ctrl.getTimetable);

// GET /api/course-groups (liệt kê mọi học phần kèm thông tin sinh viên và giảng viên)
router.get('/', verifyToken, requirePermission('courses.manage', 'excel.import'), ctrl.list);

// POST /api/course-groups (tạo học phần mới kèm lịch học và giảng viên)
router.post('/', ...manage, ctrl.create);

// PUT /api/course-groups/:id (cập nhật lịch học và thông tin học phần)
router.put('/:id', ...manage, ctrl.update);

// DELETE /api/course-groups/:id (xóa học phần)
router.delete('/:id', ...manage, ctrl.remove);

// POST /api/course-groups/:id/assign-student (đăng ký từng sinh viên theo MSSV hoặc ID)
router.post('/:id/assign-student', ...manage, ctrl.assignStudent);

// DELETE /api/course-groups/:id/remove-student/:studentId (rút tên sinh viên)
router.delete('/:id/remove-student/:studentId', ...manage, ctrl.removeStudent);

// POST /api/course-groups/:id/assign-class (đăng ký toàn bộ sinh viên của một lớp vào học phần này)
router.post('/:id/assign-class', ...manage, ctrl.assignClass);

module.exports = router;
