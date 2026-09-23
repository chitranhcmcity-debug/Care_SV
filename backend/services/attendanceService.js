const { CALL_STATUS, OPEN_CALL_STATUSES } = require('../constants/callStatus');
const Attendance = require('../models/Attendance');
const CallTask = require('../models/CallTask');
const Student = require('../models/Student');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');
const RoundRobinCursor = require('../models/RoundRobinCursor');
const { validateAttendance, dayBounds, dateKey } = require('../utils/validation');

// Serialize edits to the same session in this process. The unique session index
// additionally prevents duplicate records across multiple server processes.
const pending = new Map();

// Persisted, atomically-incremented cursor so round-robin actually rotates across
// separate saveAttendance calls (and processes), instead of restarting at staff[0]
// every time because it indexed by position within that session's absentee list.
// Reserves `count` consecutive seats in one write and returns the first one.
async function reserveRoundRobinSeats(count) {
  if (!count) return 0;
  const updated = await RoundRobinCursor.findOneAndUpdate(
    { _id: 'callTaskAssignment' },
    { $inc: { value: count } },
    { upsert: true, returnDocument: 'after' },
  );
  return updated.value - count;
}
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
    let attendance = await Attendance.findOne(filter);
    const isUpdate = !!attendance;
    if (!attendance) attendance = new Attendance({ courseGroupId: group._id, date: bounds.date });
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
    await CallTask.deleteMany({
      ...tasksFilter,
      studentId: { $nin: absentStudentIds },
      callAttempts: 0,
      status: CALL_STATUS.PENDING,
    });
    const existing = await CallTask.find(tasksFilter).select('studentId');
    const assigned = new Set(existing.map((task) => String(task.studentId)));
    const missing = absentStudentIds.filter((id) => !assigned.has(id));
    const settings = await SystemSettings.findOne();
    const rule = settings?.taskAssignmentRule || 'round-robin';
    let staff = await User.find({
      role: rule === 'admin-only' ? 'admin' : 'staff',
      status: 'active',
    }).sort({ _id: 1 });
    if (!staff.length)
      staff = await User.find({ role: 'admin', status: 'active' }).sort({ _id: 1 });
    const assignments = [];
    if (staff.length && missing.length) {
      const students = await Student.find({ _id: { $in: missing } });
      const studentMap = new Map(students.map((student) => [String(student._id), student]));
      const loads = new Map(
        await Promise.all(
          staff.map(async (member) => [
            String(member._id),
            await CallTask.countDocuments({
              assignedStaffId: member._id,
              status: { $in: OPEN_CALL_STATUSES },
            }),
          ]),
        ),
      );
      const managers = new Map(
        missing.map((studentId) => {
          const classCode = studentMap.get(studentId).classCode.trim().toUpperCase();
          const manager =
            staff.find((person) => person.managedStudents.some((id) => String(id) === studentId)) ||
            staff.find((person) => person.managedClasses.includes(classCode));
          return [studentId, manager];
        }),
      );
      let seat =
        rule === 'least-tasks'
          ? 0
          : await reserveRoundRobinSeats(missing.filter((id) => !managers.get(id)).length);
      for (const studentId of missing) {
        const student = studentMap.get(studentId);
        const member =
          managers.get(studentId) ||
          (rule === 'least-tasks'
            ? staff.reduce((least, candidate) =>
                loads.get(String(candidate._id)) < loads.get(String(least._id)) ? candidate : least,
              )
            : staff[seat++ % staff.length]);
        const task = await CallTask.updateOne(
          { attendanceId: attendance._id, studentId },
          {
            $setOnInsert: {
              courseGroupId: group._id,
              assignedStaffId: member._id,
              absenceDate: bounds.date,
              status: CALL_STATUS.PENDING,
              callNote: '',
              callAttempts: 0,
            },
          },
          { upsert: true, runValidators: true },
        );
        if (task.upsertedCount) {
          loads.set(String(member._id), loads.get(String(member._id)) + 1);
          assignments.push({
            staffName: member.fullName,
            studentName: student.fullName,
            studentCode: student.studentCode,
            classCode: student.classCode,
          });
        }
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
    await CallTask.deleteMany({
      courseGroupId: attendance.courseGroupId,
      absenceDate: { $gte: start, $lt: end },
      callAttempts: 0,
      status: CALL_STATUS.PENDING,
    });
    await Attendance.deleteOne({ _id: attendance._id });
  });
}
module.exports = { saveAttendance, deleteAttendance };
