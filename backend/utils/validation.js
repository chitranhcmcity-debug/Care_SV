const mongoose = require('mongoose');
function assert(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
function validateId(value) {
  assert(typeof value === 'string' && mongoose.isObjectIdOrHexString(value), 'ID không hợp lệ');
}
function validateAttendance(group, absentStudents = [], excusedStudents = []) {
  assert(
    Array.isArray(absentStudents) && Array.isArray(excusedStudents),
    'Danh sách điểm danh phải là mảng',
  );
  const members = new Set(group.students.map(String));
  const seen = new Set();
  for (const id of [...absentStudents, ...excusedStudents.map((item) => item?.studentId)]) {
    validateId(id);
    assert(members.has(id), 'Sinh viên không thuộc học phần');
    assert(!seen.has(id), 'Sinh viên bị trùng trong danh sách điểm danh');
    seen.add(id);
  }
  for (const item of excusedStudents)
    assert(item.reason === undefined || typeof item.reason === 'string', 'Lý do vắng không hợp lệ');
}
function dayBounds(value = new Date()) {
  const date = new Date(value);
  assert(!Number.isNaN(date.getTime()), 'Ngày không hợp lệ');
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { date, start, end };
}
function dateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
module.exports = { assert, validateId, validateAttendance, dayBounds, dateKey };
