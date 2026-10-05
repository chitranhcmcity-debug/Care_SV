const express = require('express');
const { verifyToken, requirePermission } = require('../middleware/xacThuc');
const { requireCourseRead, requireCourseWrite } = require('../middleware/phanQuyen');
const ctrl = require('../controllers/dieuKhienDiemDanh');

const router = express.Router();
// Teachers take attendance; overseers (Trưởng phòng / PHT, admin, report viewers) only look.
router.use(
  verifyToken,
  requirePermission('attendance.take', 'attendance.view', 'reports.view', 'students.view'),
);

router.get('/course-groups', ctrl.listCourseGroups);
// GET /api/attendance/window/:courseGroupId — whether attendance can be taken right now.
router.get('/window/:courseGroupId', requireCourseRead, ctrl.getWindow);
router.get('/history/:courseGroupId', requireCourseRead, ctrl.getHistory);
router.get('/today/:courseGroupId', requireCourseRead, ctrl.getToday);
router.get('/schedule/:courseGroupId', requireCourseRead, ctrl.getSchedule);
router.get('/summary/:courseGroupId', requireCourseRead, ctrl.getSummary);
router.put('/history/:attendanceId', requireCourseWrite, ctrl.updateRecord);
router.delete('/history/:attendanceId', requireCourseWrite, ctrl.deleteRecord);
router.post('/submit', requireCourseWrite, ctrl.submit);

module.exports = router;
