const express = require('express');
const { saveAttendance, deleteAttendance } = require('../services/dichVuDiemDanh');
const attendanceQueries = require('../services/truyVanDiemDanh');
const { verifyToken, requireSignedIn } = require('../middleware/xacThuc');
const { requireCourseAccess } = require('../middleware/phanQuyen');

const router = express.Router();
router.use(verifyToken, requireSignedIn);

router.get('/course-groups', async (req, res) => {
  res.json(await attendanceQueries.listCourseGroups(req.query, req.user));
});

router.get('/history/:courseGroupId', requireCourseAccess, async (req, res) => {
  res.json(await attendanceQueries.getHistory(req.courseGroup._id));
});

router.get('/today/:courseGroupId', requireCourseAccess, async (req, res) => {
  res.json(await attendanceQueries.getToday(req.courseGroup._id));
});

router.get('/schedule/:courseGroupId', requireCourseAccess, async (req, res) => {
  res.json(await attendanceQueries.getSchedule(req.courseGroup));
});

router.put('/history/:attendanceId', requireCourseAccess, async (req, res) => {
  const result = await saveAttendance({
    ...req.body,
    group: req.courseGroup,
    user: req.user,
    date: req.attendance.date,
  });
  await result.attendance.populate(attendanceQueries.attendancePopulation);
  res.json(result);
});

router.delete('/history/:attendanceId', requireCourseAccess, async (req, res) => {
  await deleteAttendance(req.attendance);
  res.json({ message: 'Đã xóa bản ghi điểm danh' });
});

router.get('/summary/:courseGroupId', requireCourseAccess, async (req, res) => {
  res.json(await attendanceQueries.getSummary(req.courseGroup));
});

router.post('/submit', requireCourseAccess, async (req, res) => {
  const result = await saveAttendance({ ...req.body, group: req.courseGroup, user: req.user });
  res.status(result.isUpdate ? 200 : 201).json(result);
});

module.exports = router;
