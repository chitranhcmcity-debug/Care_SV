// Zalo message to parents when a student misses too many sessions in one week.
// After attendance is saved, every absent student's unexcused absences in that week (Monday to
// Sunday, all course groups added up) are counted; past PARENT_ALERT_WEEKLY_LIMIT the parent gets
// one Zalo message for that week, with the phone numbers of the student's CSSV staff member and of
// the lecturers of the missed courses so they can call back. Every message is kept for the report.
const DiemDanh = require('../models/DiemDanh');
const SinhVien = require('../models/SinhVien');
const NguoiDung = require('../models/NguoiDung');
const ThongBaoPhuHuynh = require('../models/ThongBaoPhuHuynh');
const zns = require('./dichVuZaloZns');
const { loadUnitConfig } = require('./dichVuCauHinhDonVi');
const { dateKey } = require('../utils/kiemTra');
const { PARENT_ALERT_WEEKLY_LIMIT, PARENT_ALERT_STATUS } = require('../utils/hangSo');

const DAY_MS = 24 * 60 * 60 * 1000;
// Attendance entered for older days (catching up) does not message parents.
const MAX_AGE_DAYS = 7;
const MAX_PARAM = 200; // keep template values short

/** Monday and Sunday (YYYY-MM-DD) of the week holding `day`. */
function weekOf(day) {
  const date = new Date(`${day}T12:00:00`);
  const monday = new Date(date.getTime() - ((date.getDay() + 6) % 7) * DAY_MS);
  return { weekStart: dateKey(monday), weekEnd: dateKey(new Date(monday.getTime() + 6 * DAY_MS)) };
}

const short = (text) => {
  const value = String(text ?? '').trim();
  return value.length > MAX_PARAM ? `${value.slice(0, MAX_PARAM - 1)}…` : value;
};
const dm = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const person = (name, phone) => (name ? `${name}${phone ? ` - ${phone}` : ''}` : '');

/** What the alert says and who it names, from the week's attendance. */
async function buildAlert(student, sessions, week) {
  const byGroup = new Map();
  for (const s of sessions) {
    const group = s.courseGroupId;
    const key = String(group?._id ?? s.courseGroupId);
    const entry = byGroup.get(key) || { group, count: 0 };
    entry.count += 1;
    byGroup.set(key, entry);
  }
  const teacherIds = [...byGroup.values()].map((e) => e.group?.teacherId).filter(Boolean);
  const [teachers, staff] = await Promise.all([
    NguoiDung.find({ _id: { $in: teacherIds } }).select('fullName phone').lean(),
    NguoiDung.findOne({ role: 'staff', status: 'active', managedClasses: student.classCode })
      .select('fullName phone')
      .lean(),
  ]);
  const teacherById = new Map(teachers.map((t) => [String(t._id), t]));
  const courses = [...byGroup.values()].map(({ group, count }) => {
    const teacher = teacherById.get(String(group?.teacherId));
    return {
      groupCode: group?.groupCode || '',
      courseName: group?.courseName || group?.groupCode || 'Học phần',
      count,
      teacherName: teacher?.fullName || '',
      teacherPhone: teacher?.phone || '',
    };
  });
  const lecturers = courses
    .filter((c) => c.teacherName)
    .map((c) => `${person(c.teacherName, c.teacherPhone)} (${c.courseName})`)
    .join('; ');
  const missed = courses.map((c) => `${c.courseName} (${c.count} buổi)`).join(', ');
  const fields = {
    studentId: student._id,
    ...week,
    absentCount: sessions.length,
    courses,
    staffName: staff?.fullName || '',
    staffPhone: staff?.phone || '',
    parentPhone: student.parentPhone || '',
  };
  const templateData = {
    ten_sinh_vien: short(student.fullName),
    ma_sinh_vien: short(student.studentCode),
    lop: short(student.classCode),
    so_buoi_vang: String(sessions.length),
    tuan: `${dm(week.weekStart)} - ${dm(week.weekEnd)}`,
    mon_vang: short(missed),
    nhan_vien: short(fields.staffName || 'Phòng Chăm sóc sinh viên'),
    sdt_nhan_vien: short(fields.staffPhone || '—'),
    giang_vien: short(lecturers || '—'),
  };
  const content = [
    `Sinh viên ${student.fullName} (${student.studentCode}, lớp ${student.classCode}) đã vắng ${sessions.length} buổi trong tuần ${templateData.tuan}: ${missed}.`,
    `Nhân viên chăm sóc sinh viên: ${person(fields.staffName, fields.staffPhone) || 'chưa phân công'}.`,
    lecturers ? `Giảng viên: ${lecturers}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { fields: { ...fields, content }, templateData };
}

/** Sends (or re-sends) one alert and records the outcome on it. */
async function deliver(alert, templateData) {
  alert.attempts += 1;
  alert.error = '';
  if (!zns.toZaloPhone(alert.parentPhone)) alert.status = PARENT_ALERT_STATUS.NO_PHONE;
  else if (!zns.isConfigured()) alert.status = PARENT_ALERT_STATUS.NOT_CONFIGURED;
  else {
    try {
      const { msgId } = await zns.sendTemplate(alert.parentPhone, templateData, alert._id);
      Object.assign(alert, { status: PARENT_ALERT_STATUS.SENT, msgId, sentAt: new Date() });
    } catch (error) {
      Object.assign(alert, { status: PARENT_ALERT_STATUS.FAILED, error: error.message });
    }
  }
  await alert.save();
  return alert;
}

/**
 * Checks the given absent students for the week of `sessionDay` and messages the parents of those
 * past the limit (once per student and week). Runs inside the unit of the attendance.
 */
async function checkWeeklyAbsences(studentIds, sessionDay) {
  if (!studentIds?.length || !sessionDay) return [];
  if (Date.now() - new Date(`${sessionDay}T23:59:59`).getTime() > MAX_AGE_DAYS * DAY_MS) return [];
  if (!(await loadUnitConfig()).parentAlertsEnabled) return [];
  const week = weekOf(sessionDay);
  const sent = [];
  for (const studentId of studentIds) {
    const sessions = await DiemDanh.find({
      sessionDay: { $gte: week.weekStart, $lte: week.weekEnd },
      absentStudents: studentId,
    })
      .populate('courseGroupId', 'groupCode courseName teacherId')
      .lean();
    if (sessions.length <= PARENT_ALERT_WEEKLY_LIMIT) continue;
    if (await ThongBaoPhuHuynh.exists({ studentId, weekStart: week.weekStart })) continue;
    const student = await SinhVien.findById(studentId)
      .select('fullName studentCode classCode parentPhone')
      .lean();
    if (!student) continue;
    const { fields, templateData } = await buildAlert(student, sessions, week);
    let alert;
    try {
      // Claimed before sending, so two saves at once cannot message the parent twice.
      alert = await ThongBaoPhuHuynh.create({ ...fields, status: PARENT_ALERT_STATUS.NOT_CONFIGURED });
    } catch (error) {
      if (error.code === 11000) continue;
      throw error;
    }
    sent.push(await deliver(alert, templateData));
  }
  return sent;
}

/** Report: re-sends an alert that did not go through (details are rebuilt from today's data). */
async function resend(alert) {
  const student = await SinhVien.findById(alert.studentId)
    .select('fullName studentCode classCode parentPhone')
    .lean();
  if (!student) return deliver(alert, {});
  const sessions = await DiemDanh.find({
    sessionDay: { $gte: alert.weekStart, $lte: alert.weekEnd },
    absentStudents: alert.studentId,
  })
    .populate('courseGroupId', 'groupCode courseName teacherId')
    .lean();
  const { fields, templateData } = await buildAlert(student, sessions, {
    weekStart: alert.weekStart,
    weekEnd: alert.weekEnd,
  });
  alert.set({ ...fields, absentCount: sessions.length || alert.absentCount });
  return deliver(alert, templateData);
}

module.exports = { checkWeeklyAbsences, resend, weekOf };
