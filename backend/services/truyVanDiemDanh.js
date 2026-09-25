const DiemDanh = require('../models/DiemDanh');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const NhomHocPhan = require('../models/NhomHocPhan');
const { getWarningLevels, periodInfo, evaluate } = require('./dichVuCanhBao');
const { dayBounds, dateKey } = require('../utils/kiemTra');
const { WEEKDAY_INDEX } = require('../utils/hangSo');
const { seesAllCourses } = require('../middleware/phanQuyen');

const attendancePopulation = [
  { path: 'absentStudents', select: 'studentCode fullName classCode phone parentPhone' },
  { path: 'excusedStudents.studentId', select: 'studentCode fullName classCode phone parentPhone' },
  { path: 'recordedBy', select: 'fullName email' },
];

async function listCourseGroups(query, user) {
  const { shift, search } = query;
  const filter = {};

  // Teachers see the groups they teach; overseers (Trưởng phòng, admin read-only) see all.
  if (!seesAllCourses(user)) filter.teacherId = user.id;

  if (shift) {
    filter.shift = shift;
  }

  if (search) {
    const searchRegex = { $regex: RegExp.escape(String(search)), $options: 'i' };
    filter.$or = [{ groupCode: searchRegex }, { courseName: searchRegex }];
  }

  const groups = await NhomHocPhan.find(filter)
    .populate('students')
    .populate('teacherId', 'fullName email')
    .sort({ groupCode: 1 });

  return groups;
}

async function getHistory(courseGroupId) {
  const history = await DiemDanh.find({ courseGroupId })
    .populate(attendancePopulation)
    .sort({ date: -1 });

  return history;
}

async function getToday(courseGroupId) {
  const { start, end } = dayBounds();

  const todayRecord = await DiemDanh.findOne({
    courseGroupId,
    date: { $gte: start, $lt: end },
  }).populate(attendancePopulation);

  // Trả về null nếu chưa điểm danh hôm nay
  return todayRecord || null;
}

async function getSchedule(cg) {
  const scheduledDayNums = (cg.scheduleDays || [])
    .map((d) => WEEKDAY_INDEX[d])
    .filter((d) => d !== undefined);

  // Phạm vi: startDate → endDate (toàn bộ học kỳ, bao gồm cả buổi tương lai)
  const start = cg.startDate ? new Date(cg.startDate) : null;
  const end = cg.endDate ? new Date(cg.endDate) : null;

  // Nếu chưa cấu hình startDate → fallback về lịch sử đã ghi
  if (!start) {
    const history = await DiemDanh.find({ courseGroupId: cg._id })
      .populate(attendancePopulation)
      .sort({ date: 1 });

    const sessions = history.map((att) => ({
      scheduledDate: att.date,
      status: 'recorded',
      attendance: att,
    }));
    return { hasDates: false, sessions, courseGroup: cg };
  }

  // Helper: so sánh ngày theo local date string (tránh lỗi timezone)
  const todayStr = dateKey(new Date());

  // endLimit = endDate nếu có, ngược lại lấy 90 ngày từ startDate
  const endLimit = end
    ? new Date(end)
    : (() => {
        const d = new Date(start);
        d.setDate(d.getDate() + 90);
        return d;
      })();
  endLimit.setHours(23, 59, 59, 999);

  // Sinh TẤT CẢ ngày học theo lịch từ startDate đến endDate
  const allScheduledDates = [];
  const cursor = new Date(start);
  cursor.setHours(12, 0, 0, 0); // dùng giữa ngày để tránh DST shift

  while (cursor <= endLimit) {
    if (scheduledDayNums.includes(cursor.getDay())) {
      allScheduledDates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // Lấy tất cả bản ghi điểm danh của học phần
  const records = await DiemDanh.find({ courseGroupId: cg._id })
    .populate(attendancePopulation)
    .sort({ date: 1 });

  // Ghép: với mỗi ngày lịch, tìm bản ghi điểm danh tương ứng
  const recordsByDay = new Map();
  for (const record of records) {
    const key = dateKey(record.date);
    if (!recordsByDay.has(key)) recordsByDay.set(key, record);
  }
  const matchedRecordIds = new Set();
  const sessions = allScheduledDates.map((date) => {
    const dateStr = dateKey(date);
    const rec = recordsByDay.get(dateStr);
    if (rec) matchedRecordIds.add(rec._id.toString());

    let status;
    if (rec) status = 'recorded';
    else if (dateStr <= todayStr) status = 'missing';
    else status = 'future';

    return { scheduledDate: date, status, attendance: rec || null };
  });

  // Thêm các bản ghi điểm danh không nằm trong lịch (ngoài startDate hoặc lệch lịch)
  const orphanRecords = records.filter((r) => !matchedRecordIds.has(r._id.toString()));
  orphanRecords.forEach((rec) => {
    sessions.push({
      scheduledDate: rec.date,
      status: 'recorded',
      attendance: rec,
    });
  });

  // Sort lại theo ngày
  sessions.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));

  return { hasDates: true, sessions, courseGroup: cg };
}

async function getSummary(group) {
  await group.populate('students', 'studentCode fullName classCode phone parentPhone major');
  const courseGroupId = group._id;

  const allAttendance = await DiemDanh.find({ courseGroupId }).sort({ date: 1 });
  const totalSessions = allAttendance.length;

  // Count absences per student
  const absentCountMap = {};
  const excusedCountMap = {};
  for (const record of allAttendance) {
    for (const studentId of record.absentStudents) {
      const sid = studentId.toString();
      absentCountMap[sid] = (absentCountMap[sid] || 0) + 1;
    }
    if (record.excusedStudents && Array.isArray(record.excusedStudents)) {
      for (const item of record.excusedStudents) {
        const sid = item.studentId
          ? (typeof item.studentId === 'object' ? item.studentId._id : item.studentId).toString()
          : '';
        if (sid) {
          excusedCountMap[sid] = (excusedCountMap[sid] || 0) + 1;
        }
      }
    }
  }

  // Get call task status for each student
  const callTasks = await NhiemVuGoiDien.find({ courseGroupId })
    .populate('assignedStaffId', 'fullName')
    .sort({ createdAt: -1 });

  const latestTaskMap = {};
  for (const task of callTasks) {
    const sid = task.studentId.toString();
    if (!latestTaskMap[sid]) {
      latestTaskMap[sid] = task;
    }
  }

  // Absences are counted in periods (tiết) and ranked by the configured warning levels.
  const levels = await getWarningLevels();
  const info = periodInfo(group);

  // Build summary per student
  const students = Array.isArray(group.students) ? group.students : [];
  const summary = students.map((st) => {
    const sid = st._id.toString();
    const absentCount = absentCountMap[sid] || 0;
    const excusedCount = excusedCountMap[sid] || 0;
    const attendCount = totalSessions - (absentCount + excusedCount);
    const attendRate = totalSessions > 0 ? Math.round((attendCount / totalSessions) * 100) : 100;
    const latestTask = latestTaskMap[sid];

    return {
      student: st,
      totalSessions,
      absentCount,
      excusedCount,
      attendCount,
      attendRate,
      ...evaluate(absentCount, info, levels),
      callStatus: latestTask?.status || null,
      callNote: latestTask?.callNote || null,
      assignedStaff: latestTask?.assignedStaffId?.fullName || null,
    };
  });

  // Sort: most severe warning level first, then by absent count desc
  const rank = (row) =>
    row.warningLevel ? levels.findIndex((l) => l.name === row.warningLevel.name) + 1 : 0;
  summary.sort((a, b) => rank(b) - rank(a) || b.absentCount - a.absentCount);

  return {
    courseGroup: {
      _id: group._id,
      groupCode: group.groupCode,
      courseName: group.courseName,
      shift: group.shift,
      room: group.room,
    },
    totalSessions,
    periodsPerSession: info.periodsPerSession,
    totalPeriods: info.totalPeriods,
    warningLevels: levels,
    summary,
  };
}

module.exports = {
  attendancePopulation,
  listCourseGroups,
  getHistory,
  getToday,
  getSchedule,
  getSummary,
};
