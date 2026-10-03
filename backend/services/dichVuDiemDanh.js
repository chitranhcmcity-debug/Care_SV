const DiemDanh = require('../models/DiemDanh');
const SinhVien = require('../models/SinhVien');
const { openCasesForWarnings } = require('./dichVuHoSoChamSoc');
const { checkWeeklyAbsences } = require('./dichVuCanhBaoPhuHuynh');
const { validateAttendance, dayBounds, dateKey } = require('../utils/kiemTra');

// Serialize edits to the same session in this process. The unique session index
// additionally prevents duplicate records across multiple server processes.
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
    // Students who now reach a warning level get a care case (default: their class's staff).
    const openedCases = await openCasesForWarnings(group, absentStudentIds);
    // Parents of students absent too often this week get a Zalo message. Runs in the background
    // so the lecturer is not kept waiting on Zalo; the outcome is kept for the report.
    checkWeeklyAbsences(absentStudentIds, sessionDay).catch((error) =>
      console.warn('[Zalo] Không xử lý được tin cảnh báo phụ huynh:', error.message),
    );
    // The absent students, so the lecturer can choose to call them right away.
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
