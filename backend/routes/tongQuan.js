const express = require('express');
const router = express.Router();
const NguoiDung = require('../models/NguoiDung');
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const DiemDanh = require('../models/DiemDanh');
const CuocGoi = require('../models/CuocGoi');
const HoSoChamSoc = require('../models/HoSoChamSoc');
const subscription = require('../services/dichVuGoiDichVu');
const payos = require('../services/dichVuPayOS');
const { describeIntegrations } = require('../services/dichVuCauHinhApi');
const { getWarningLevels, periodInfo, evaluate } = require('../services/dichVuCanhBao');
const { verifyToken, requireAdmin } = require('../middleware/xacThuc');
const { CARE_STATUS } = require('../utils/hangSo');

const DAYS = 7;
const TIMEZONE = 'Asia/Ho_Chi_Minh';
const dayKey = (date) => date.toLocaleDateString('en-CA', { timeZone: TIMEZONE }); // YYYY-MM-DD

/** Documents created per day since `since`, as { 'YYYY-MM-DD': count }. */
async function perDay(Model, since) {
  const rows = await Model.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TIMEZONE } },
        count: { $sum: 1 },
      },
    },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r.count]));
}

/** Present / excused / absent student counts per day of the sessions recorded since `since`. */
async function attendancePerDay(since) {
  const sessions = await DiemDanh.find({ createdAt: { $gte: since } })
    .select('courseGroupId absentStudents excusedStudents createdAt')
    .lean();
  const groups = await NhomHocPhan.find({ _id: { $in: sessions.map((s) => s.courseGroupId) } })
    .select('students')
    .lean();
  const size = new Map(groups.map((g) => [String(g._id), (g.students || []).length]));
  const days = {};
  for (const s of sessions) {
    const day = (days[dayKey(s.createdAt)] ??= { present: 0, excused: 0, absent: 0 });
    const absent = (s.absentStudents || []).length;
    const excused = (s.excusedStudents || []).length;
    day.absent += absent;
    day.excused += excused;
    day.present += Math.max(0, (size.get(String(s.courseGroupId)) || 0) - absent - excused);
  }
  return days;
}

/** Calls made since `since`, by how they went. */
async function callOutcomes(since) {
  const rows = await CuocGoi.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: '$outcome', count: { $sum: 1 } } },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r._id, r.count]));
  return {
    answered: by.nghe_may || 0,
    noAnswer: by.khong_nghe_may || 0,
    busy: (by.may_ban || 0) + (by.sai_so || 0),
    unrecorded: by[''] || 0,
  };
}

/** The most severe (then most recent) students at a warning level, plus how many there are. */
async function latestWarnings(limit = 4) {
  const sessions = await DiemDanh.find({ 'absentStudents.0': { $exists: true } })
    .select('courseGroupId absentStudents date createdAt')
    .lean();
  const perPair = new Map(); // "groupId_studentId" -> { count, last }
  for (const s of sessions) {
    const when = s.date || s.createdAt;
    for (const sid of s.absentStudents) {
      const key = `${s.courseGroupId}_${sid}`;
      const row = perPair.get(key) ?? { count: 0, last: when };
      row.count++;
      if (when > row.last) row.last = when;
      perPair.set(key, row);
    }
  }
  if (!perPair.size) return { count: 0, items: [] };
  const [levels, groups] = await Promise.all([
    getWarningLevels(),
    NhomHocPhan.find({ _id: { $in: [...new Set(sessions.map((s) => s.courseGroupId))] } })
      .select('groupCode courseName scheduleDays startDate endDate periodsPerSession totalPeriods')
      .lean(),
  ]);
  const groupMap = new Map(groups.map((g) => [String(g._id), g]));
  const rank = (level) => levels.findIndex((l) => l.name === level.name);
  const flagged = [];
  for (const [key, row] of perPair) {
    const [gid, sid] = key.split('_');
    const group = groupMap.get(gid);
    if (!group) continue;
    const result = evaluate(row.count, periodInfo(group), levels);
    if (result.warningLevel) flagged.push({ sid, group, last: row.last, ...result });
  }
  flagged.sort((a, b) => rank(b.warningLevel) - rank(a.warningLevel) || b.last - a.last);
  const top = flagged.slice(0, limit);
  const students = await SinhVien.find({ _id: { $in: top.map((f) => f.sid) } })
    .select('studentCode fullName')
    .lean();
  const studentMap = new Map(students.map((st) => [String(st._id), st]));
  return {
    count: flagged.length,
    items: top
      .filter((f) => studentMap.has(f.sid))
      .map((f) => ({
        student: studentMap.get(f.sid),
        groupCode: f.group.groupCode,
        level: f.warningLevel.name,
        color: f.warningLevel.color,
        examBan: f.isAtRisk,
        absentPeriods: f.absentPeriods,
        lastAbsence: f.last,
      })),
  };
}

const countBy = async (field) =>
  Object.fromEntries(
    (await NguoiDung.aggregate([{ $group: { _id: `$${field}`, count: { $sum: 1 } } }])).map((r) => [
      r._id,
      r.count,
    ]),
  );

/** An integration group is ready when every key without a built-in default has a value. */
function integrationStatus() {
  const groups = new Map();
  for (const item of describeIntegrations()) {
    const ready = groups.get(item.group) ?? true;
    groups.set(item.group, ready && (Boolean(item.placeholder) || item.source !== 'none'));
  }
  return [...groups].map(([name, configured]) => ({ name, configured }));
}

// GET /api/overview (Admin) — system health at a glance. Mounted outside the subscription lock
// so the admin still sees it (and the renewal state) after the subscription expires.
router.get('/', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const today = new Date();
    const since = new Date(today);
    since.setDate(since.getDate() - (DAYS - 1));
    since.setHours(0, 0, 0, 0);

    const [
      sub,
      byRole,
      byStatus,
      recentUsers,
      students,
      classCodes,
      courseGroups,
      groupsWithoutTeacher,
      assignedClasses,
      awaitingCases,
      inProgressCases,
      attendanceByDay,
      callsByDay,
      callsWithRecording,
      attendanceBreakdown,
      outcomes,
      warnings,
      newUsers,
      newStudents,
      newGroups,
      newCases,
    ] = await Promise.all([
      subscription.getSubscription(),
      countBy('role'),
      countBy('status'),
      NguoiDung.find()
        .select('fullName email role status createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      SinhVien.countDocuments(),
      SinhVien.distinct('classCode'),
      NhomHocPhan.countDocuments(),
      NhomHocPhan.countDocuments({ teacherId: null }),
      NguoiDung.distinct('managedClasses', { role: 'staff', status: 'active' }),
      HoSoChamSoc.countDocuments({ status: CARE_STATUS.AWAITING }),
      HoSoChamSoc.countDocuments({ status: CARE_STATUS.IN_PROGRESS }),
      perDay(DiemDanh, since),
      perDay(CuocGoi, since),
      CuocGoi.countDocuments({
        createdAt: { $gte: since },
        'recording.storedName': { $exists: true },
      }),
      attendancePerDay(since),
      callOutcomes(since),
      latestWarnings(),
      perDay(NguoiDung, since),
      perDay(SinhVien, since),
      perDay(NhomHocPhan, since),
      perDay(HoSoChamSoc, since),
    ]);

    const assigned = new Set(assignedClasses);
    const activity = Array.from({ length: DAYS }, (_, i) => {
      const day = new Date(since);
      day.setDate(since.getDate() + i);
      const key = dayKey(day);
      return {
        date: key,
        attendance: attendanceByDay[key] || 0,
        calls: callsByDay[key] || 0,
        students: attendanceBreakdown[key] ?? { present: 0, excused: 0, absent: 0 },
        created: {
          users: newUsers[key] || 0,
          students: newStudents[key] || 0,
          courseGroups: newGroups[key] || 0,
          careCases: newCases[key] || 0,
        },
      };
    });

    res.json({
      subscription: { ...sub, payosConfigured: payos.isConfigured() },
      users: {
        total: Object.values(byRole).reduce((a, b) => a + b, 0),
        byRole,
        byStatus,
        recent: recentUsers,
      },
      data: {
        students,
        classes: classCodes.length,
        classesWithoutStaff: classCodes.filter((c) => !assigned.has(c)).length,
        courseGroups,
        groupsWithoutTeacher,
      },
      careCases: { awaiting: awaitingCases, inProgress: inProgressCases },
      callOutcomes: outcomes,
      warnings,
      activity,
      callsWithRecording,
      integrations: integrationStatus(),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
