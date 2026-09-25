const express = require('express');
const { saveAttendance, deleteAttendance } = require('../services/dichVuDiemDanh');
const attendanceQueries = require('../services/truyVanDiemDanh');
const { attendanceWindow } = require('../services/dichVuCanhBao');
const { verifyToken, requirePermission } = require('../middleware/xacThuc');
const { requireCourseRead, requireCourseWrite } = require('../middleware/phanQuyen');
const { assert, dateKey } = require('../utils/kiemTra');

const router = express.Router();
// Teachers take attendance; overseers (Trưởng phòng, admin read-only, report viewers) can look.
router.use(
  verifyToken,
  requirePermission('attendance.take', 'attendance.override', 'reports.view', 'students.view'),
);

/**
 * Teachers may only write today's attendance, inside the class-time window of the timetable
 * (see dichVuCanhBao.attendanceWindow). attendance.override skips the check.
 */
async function assertTeacherWindow(req, recordDate) {
  if (req.canOverrideAttendance) return;
  const now = new Date();
  assert(
    !recordDate || dateKey(recordDate) === dateKey(now),
    'Giảng viên chỉ được điểm danh / sửa điểm danh trong ngày học. Liên hệ Trưởng phòng để điều chỉnh ngày khác.',
    403,
  );
  const hasRecordToday = Boolean(await attendanceQueries.getToday(req.courseGroup._id));
  const window = attendanceWindow(req.courseGroup, { hasRecordToday, now });
  assert(window.open, window.reason, 403);
}

router.get('/course-groups', async (req, res) => {
  res.json(await attendanceQueries.listCourseGroups(req.query, req.user));
});

// GET /api/attendance/window/:courseGroupId — whether attendance can be taken right now.
router.get('/window/:courseGroupId', requireCourseRead, async (req, res) => {
  const hasRecordToday = Boolean(await attendanceQueries.getToday(req.courseGroup._id));
  const window = attendanceWindow(req.courseGroup, { hasRecordToday });
  const isTeacher = String(req.courseGroup.teacherId) === req.user.id;
  res.json({
    ...window,
    canOverride: Boolean(req.canOverrideAttendance),
    // Overseers without override (e.g. admin) can look but never write.
    open: req.canOverrideAttendance || (isTeacher && window.open),
  });
});

router.get('/history/:courseGroupId', requireCourseRead, async (req, res) => {
  res.json(await attendanceQueries.getHistory(req.courseGroup._id));
});

router.get('/today/:courseGroupId', requireCourseRead, async (req, res) => {
  res.json(await attendanceQueries.getToday(req.courseGroup._id));
});

router.get('/schedule/:courseGroupId', requireCourseRead, async (req, res) => {
  res.json(await attendanceQueries.getSchedule(req.courseGroup));
});

router.get('/summary/:courseGroupId', requireCourseRead, async (req, res) => {
  res.json(await attendanceQueries.getSummary(req.courseGroup));
});

router.put('/history/:attendanceId', requireCourseWrite, async (req, res) => {
  await assertTeacherWindow(req, req.attendance.date);
  const result = await saveAttendance({
    ...req.body,
    group: req.courseGroup,
    user: req.user,
    date: req.attendance.date,
  });
  await result.attendance.populate(attendanceQueries.attendancePopulation);
  res.json(result);
});

router.delete('/history/:attendanceId', requireCourseWrite, async (req, res) => {
  await assertTeacherWindow(req, req.attendance.date);
  await deleteAttendance(req.attendance);
  res.json({ message: 'Đã xóa bản ghi điểm danh' });
});

router.post('/submit', requireCourseWrite, async (req, res) => {
  // A teacher's record is always for right now; only overrides may pick another date.
  const date = req.canOverrideAttendance && req.body?.date ? req.body.date : new Date();
  await assertTeacherWindow(req, date);
  const result = await saveAttendance({
    ...req.body,
    date,
    group: req.courseGroup,
    user: req.user,
  });
  res.status(result.isUpdate ? 200 : 201).json(result);
});

module.exports = router;
