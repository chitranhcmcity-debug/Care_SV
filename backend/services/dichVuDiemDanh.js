const { CALL_STATUS } = require('../utils/hangSo');
const DiemDanh = require('../models/DiemDanh');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const SinhVien = require('../models/SinhVien');
const { staffForClass } = require('./dichVuPhanCongLop');
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
    const tasksFilter = {
      courseGroupId: group._id,
      absenceDate: { $gte: bounds.start, $lt: bounds.end },
    };
    // Preserve contacted history, but remove untouched tasks for corrected absences.
    await NhiemVuGoiDien.deleteMany({
      ...tasksFilter,
      studentId: { $nin: absentStudentIds },
      callAttempts: 0,
      status: CALL_STATUS.PENDING,
    });
    const existing = await NhiemVuGoiDien.find(tasksFilter).select('studentId');
    const assigned = new Set(existing.map((task) => String(task.studentId)));
    const missing = absentStudentIds.filter((id) => !assigned.has(id));
    // Each absent student's call goes to the staff member currently responsible for their
    // administrative class; classes without one go to the manager's queue (assignedStaffId null).
    const assignments = [];
    if (missing.length) {
      const students = await SinhVien.find({ _id: { $in: missing } });
      const owners = new Map();
      for (const student of students) {
        const code = String(student.classCode || '')
          .trim()
          .toUpperCase();
        if (!owners.has(code)) owners.set(code, await staffForClass(code));
      }
      for (const student of students) {
        const owner = owners.get(
          String(student.classCode || '')
            .trim()
            .toUpperCase(),
        );
        const task = await NhiemVuGoiDien.updateOne(
          { attendanceId: attendance._id, studentId: student._id },
          {
            $setOnInsert: {
              courseGroupId: group._id,
              assignedStaffId: owner ? owner._id : null,
              absenceDate: bounds.date,
              status: CALL_STATUS.PENDING,
              callNote: '',
              callAttempts: 0,
            },
          },
          { upsert: true, runValidators: true },
        );
        if (task.upsertedCount)
          assignments.push({
            staffName: owner ? owner.fullName : 'Hàng chờ Trưởng phòng (lớp chưa phân công)',
            unassigned: !owner,
            studentName: student.fullName,
            studentCode: student.studentCode,
            classCode: student.classCode,
          });
      }
    }
    return {
      message: 'Đã lưu điểm danh',
      attendance,
      createdTasksCount: assignments.length,
      taskAssignments: assignments,
      isUpdate,
    };
  });
}

async function deleteAttendance(attendance) {
  return withSessionLock(`${attendance.courseGroupId}:${dateKey(attendance.date)}`, async () => {
    const { start, end } = dayBounds(attendance.date);
    await NhiemVuGoiDien.deleteMany({
      courseGroupId: attendance.courseGroupId,
      absenceDate: { $gte: start, $lt: end },
      callAttempts: 0,
      status: CALL_STATUS.PENDING,
    });
    await DiemDanh.deleteOne({ _id: attendance._id });
  });
}
module.exports = { saveAttendance, deleteAttendance };
