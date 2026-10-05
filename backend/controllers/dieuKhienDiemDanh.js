const { saveAttendance, deleteAttendance } = require('../services/dichVuDiemDanh');
const attendanceQueries = require('../services/truyVanDiemDanh');
const { attendanceWindow } = require('../services/dichVuCanhBao');
const { assert, dateKey } = require('../utils/kiemTra');

/**
 * Điểm danh chỉ do giảng viên ghi, cho ngày hôm nay, trong khung giờ học của
 * thời khóa biểu (xem dichVuCanhBao.attendanceWindow). Hết giờ học thì bản ghi được chốt.
 */
async function assertTeacherWindow(req, recordDate) {
  const now = new Date();
  assert(
    !recordDate || dateKey(recordDate) === dateKey(now),
    'Điểm danh của buổi học trước đã được chốt, không sửa được nữa.',
    403,
  );
  const hasRecordToday = Boolean(await attendanceQueries.getToday(req.courseGroup._id));
  const window = attendanceWindow(req.courseGroup, { hasRecordToday, now });
  assert(window.open, window.reason, 403);
}

async function listCourseGroups(req, res) {
  res.json(await attendanceQueries.listCourseGroups(req.query, req.user));
}

async function getWindow(req, res) {
  const hasRecordToday = Boolean(await attendanceQueries.getToday(req.courseGroup._id));
  const window = attendanceWindow(req.courseGroup, { hasRecordToday });
  const isTeacher = String(req.courseGroup.teacherId) === req.user.id;
  res.json({
    ...window,
    // Chỉ giảng viên được ghi; bên giám sát luôn chỉ xem (chế độ chỉ đọc).
    canWrite: isTeacher,
    open: isTeacher && window.open,
  });
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

async function getSummary(req, res) {
  res.json(await attendanceQueries.getSummary(req.courseGroup));
}

async function updateRecord(req, res) {
  await assertTeacherWindow(req, req.attendance.date);
  const result = await saveAttendance({
    ...req.body,
    group: req.courseGroup,
    user: req.user,
    date: req.attendance.date,
  });
  await result.attendance.populate(attendanceQueries.attendancePopulation);
  res.json(result);
}

async function deleteRecord(req, res) {
  await assertTeacherWindow(req, req.attendance.date);
  await deleteAttendance(req.attendance);
  res.json({ message: 'Đã xóa bản ghi điểm danh' });
}

async function submit(req, res) {
  // Bản ghi luôn là cho thời điểm hiện tại; các buổi trước đã được chốt.
  const date = new Date();
  await assertTeacherWindow(req, date);
  const result = await saveAttendance({
    ...req.body,
    date,
    group: req.courseGroup,
    user: req.user,
  });
  res.status(result.isUpdate ? 200 : 201).json(result);
}

module.exports = {
  listCourseGroups,
  getWindow,
  getHistory,
  getToday,
  getSchedule,
  getSummary,
  updateRecord,
  deleteRecord,
  submit,
};
