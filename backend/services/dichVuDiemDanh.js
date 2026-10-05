const DiemDanh = require('../models/DiemDanh');
const SinhVien = require('../models/SinhVien');
const { openCasesForWarnings } = require('./dichVuHoSoChamSoc');
const { validateAttendance, dayBounds, dateKey } = require('../utils/kiemTra');

// Tuần tự hóa các thay đổi trên cùng một buổi trong tiến trình này. Unique index của buổi
// còn ngăn bản ghi trùng giữa nhiều tiến trình máy chủ.
const pending = new Map();

async function withSessionLock(key, operation) {
  const previous = pending.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  pending.set(key, current);
  try {
    return await current;
  } finally {
    if (pending.get(key) === current) pending.delete(key);
  }
}

async function saveAttendance({
  group,
  user,
  absentStudentIds = [],
  excusedStudents = [],
  date = new Date(),
}) {
  validateAttendance(group, absentStudentIds, excusedStudents);
  const bounds = dayBounds(date);
  const sessionDay = dateKey(bounds.date);
  return withSessionLock(`${group._id}:${sessionDay}`, async () => {
    const filter = { courseGroupId: group._id, date: { $gte: bounds.start, $lt: bounds.end } };
    let attendance = await DiemDanh.findOne(filter);
    const isUpdate = !!attendance;
    if (!attendance) attendance = new DiemDanh({ courseGroupId: group._id, date: bounds.date });
    attendance.set({
      sessionDay,
      absentStudents: absentStudentIds,
      excusedStudents,
      recordedBy: user.id,
    });
    await attendance.save();
    // Sinh viên vừa đạt mức cảnh báo sẽ có hồ sơ chăm sóc (mặc định: nhân viên của lớp đó).
    const openedCases = await openCasesForWarnings(group, absentStudentIds);
    // Các sinh viên vắng, để giảng viên có thể chọn gọi ngay.
    const absent = await SinhVien.find({ _id: { $in: absentStudentIds } })
      .select('studentCode fullName classCode phone parentPhone')
      .lean();
    return {
      message: 'Đã lưu điểm danh',
      attendance,
      absentStudents: absent,
      openedCases,
      isUpdate,
    };
  });
}

async function deleteAttendance(attendance) {
  return withSessionLock(`${attendance.courseGroupId}:${dateKey(attendance.date)}`, () =>
    DiemDanh.deleteOne({ _id: attendance._id }),
  );
}
module.exports = { saveAttendance, deleteAttendance };
