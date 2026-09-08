const { saveAttendance, deleteAttendance } = require('../services/attendanceService');
const attendanceQueries = require('../services/attendanceQueryService');

async function listCourseGroups(req, res) {
  res.json(await attendanceQueries.listCourseGroups(req.query, req.user));
}

async function getHistory(req, res) {
  res.json(await attendanceQueries.getHistory(req.courseGroup._id));
}

async function getToday(req, res) {
  res.json(await attendanceQueries.getToday(req.courseGroup._id));
}

async function getSchedule(req, res) {
  res.json(await attendanceQueries.getSchedule(req.courseGroup));
}

async function updateHistory(req, res) {
  const result = await saveAttendance({
    ...req.body,
    group: req.courseGroup,
    user: req.user,
    date: req.attendance.date,
  });
  await result.attendance.populate(attendanceQueries.attendancePopulation);
  res.json(result);
}

async function removeHistory(req, res) {
  await deleteAttendance(req.attendance);
  res.json({ message: 'Đã xóa bản ghi điểm danh' });
}

async function getSummary(req, res) {
  res.json(await attendanceQueries.getSummary(req.courseGroup));
}

async function submit(req, res) {
  const result = await saveAttendance({ ...req.body, group: req.courseGroup, user: req.user });
  res.status(result.isUpdate ? 200 : 201).json(result);
}

module.exports = {
  listCourseGroups,
  getHistory,
  getToday,
  getSchedule,
  updateHistory,
  removeHistory,
  getSummary,
  submit,
};
