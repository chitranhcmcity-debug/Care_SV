const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const DiemDanh = require('../models/DiemDanh');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const { can } = require('../services/dichVuPhanQuyen');
const { getWarningLevels, periodInfo, evaluate } = require('../services/dichVuCanhBao');
const { verifyToken, requirePermission } = require('../middleware/xacThuc');
const { CALL_STATUS, OPEN_CALL_STATUSES, toLabel } = require('../utils/hangSo');

// Whole-word match so short keywords like "ca" do not hit "các", "cả", "cái"...
// Checked in order; the first bucket that matches wins.
const wholeWords = (words) => new RegExp(`(^|[^\\p{L}])(${words.join('|')})([^\\p{L}]|$)`, 'u');
const REASON_PATTERNS = [
  { reason: 'Ốm / Sức khỏe', pattern: wholeWords(['ốm', 'bệnh', 'sốt', 'viện', 'sức khỏe']) },
  { reason: 'Bận việc gia đình', pattern: wholeWords(['gia đình', 'quê', 'việc nhà']) },
  { reason: 'Bận đi làm', pattern: wholeWords(['làm', 'đi làm', 'ca']) },
  { reason: 'Quên lịch học', pattern: wholeWords(['quên', 'ngủ']) },
];

/**
 * Students the caller may report on: everyone with students.view (Trưởng phòng, admin read-only),
 * otherwise only the administrative classes assigned to them (Nhân viên CSKH). null = everyone.
 */
async function reportScope(user) {
  if (can(user, 'students.view')) return null;
  const classes = user.managedClasses || [];
  return (await SinhVien.find({ classCode: { $in: classes } }).select('_id')).map((st) => st._id);
}

// GET /api/analytics/summary
router.get('/summary', verifyToken, requirePermission('reports.view'), async (req, res, next) => {
  try {
    const scope = await reportScope(req.user);
    const taskFilter = scope ? { studentId: { $in: scope } } : {};
    const [totalTasks, completedTasks, pendingTasks, retryTasks, unassignedTasks] =
      await Promise.all([
        NhiemVuGoiDien.countDocuments(taskFilter),
        NhiemVuGoiDien.countDocuments({ ...taskFilter, status: CALL_STATUS.CONTACTED }),
        NhiemVuGoiDien.countDocuments({ ...taskFilter, status: CALL_STATUS.PENDING }),
        NhiemVuGoiDien.countDocuments({ ...taskFilter, status: CALL_STATUS.UNREACHABLE }),
        NhiemVuGoiDien.countDocuments({
          ...taskFilter,
          assignedStaffId: null,
          status: { $in: OPEN_CALL_STATUSES },
        }),
      ]);

    // 1. Absences per (course group, student), limited to the caller's scope.
    const scopeSet = scope ? new Set(scope.map(String)) : null;
    const attendances = await DiemDanh.find({}).select('courseGroupId absentStudents').lean();
    const perGroup = new Map(); // groupId -> Map(studentId -> absentSessions)
    for (const att of attendances) {
      const gid = String(att.courseGroupId);
      if (!perGroup.has(gid)) perGroup.set(gid, new Map());
      const counts = perGroup.get(gid);
      for (const sid of att.absentStudents || []) {
        if (scopeSet && !scopeSet.has(String(sid))) continue;
        counts.set(String(sid), (counts.get(String(sid)) || 0) + 1);
      }
    }
    const groups = await NhomHocPhan.find({ _id: { $in: [...perGroup.keys()] } })
      .select(
        'groupCode courseName shift scheduleDays startDate endDate periodsPerSession totalPeriods',
      )
      .lean();
    const groupMap = new Map(groups.map((g) => [String(g._id), g]));
    const courseAbsenceStats = [...perGroup.entries()]
      .map(([gid, counts]) => ({
        courseCode: groupMap.get(gid)?.groupCode || 'Khác',
        absentCount: [...counts.values()].reduce((a, b) => a + b, 0),
      }))
      .filter((row) => row.absentCount > 0);

    // 2. Reason breakdown from call notes / categories.
    const tasksWithNotes = await NhiemVuGoiDien.find({
      ...taskFilter,
      $or: [{ callNote: { $ne: '' } }, { absenceReasonCategory: { $ne: '' } }],
    })
      .select('callNote absenceReasonCategory')
      .lean();
    const reasonCounts = {
      'Ốm / Sức khỏe': 0,
      'Bận việc gia đình': 0,
      'Bận đi làm': 0,
      'Quên lịch học': 0,
      'Lý do khác': 0,
    };
    const classifyReason = (text) =>
      REASON_PATTERNS.find(({ pattern }) => pattern.test(text))?.reason ?? null;
    for (const task of tasksWithNotes) {
      // The category chosen by staff is authoritative; fall back to the free-text note.
      const category = (task.absenceReasonCategory || '').toLowerCase();
      const note = (task.callNote || '').toLowerCase();
      const bucket = (category ? classifyReason(category) : classifyReason(note)) || 'Lý do khác';
      reasonCounts[bucket]++;
    }
    const reasonStats = Object.keys(reasonCounts).map((key) => ({
      reason: key,
      count: reasonCounts[key],
    }));

    // 3. Students who reached any configured warning level (periods / % of total periods).
    const levels = await getWarningLevels();
    const flagged = [];
    for (const [gid, counts] of perGroup) {
      const group = groupMap.get(gid);
      if (!group) continue;
      const info = periodInfo(group);
      for (const [sid, absentCount] of counts) {
        const result = evaluate(absentCount, info, levels);
        if (result.warningLevel) flagged.push({ sid, gid, group, absentCount, ...result });
      }
    }
    const students = await SinhVien.find({ _id: { $in: flagged.map((f) => f.sid) } })
      .select('studentCode fullName classCode major phone parentPhone')
      .lean();
    const studentMap = new Map(students.map((st) => [String(st._id), st]));
    const lastTasks = await NhiemVuGoiDien.find({ studentId: { $in: flagged.map((f) => f.sid) } })
      .populate('assignedStaffId', 'fullName')
      .sort({ updatedAt: -1 })
      .lean();
    const lastTaskMap = new Map();
    for (const t of lastTasks) {
      const key = `${t.studentId}_${t.courseGroupId}`;
      if (!lastTaskMap.has(key)) lastTaskMap.set(key, t);
    }
    const rank = (level) => levels.findIndex((l) => l.name === level.name);
    const warningList = flagged
      .filter((f) => studentMap.has(f.sid))
      .map((f) => {
        const last = lastTaskMap.get(`${f.sid}_${f.gid}`);
        return {
          student: studentMap.get(f.sid),
          courseCode: f.group.groupCode,
          courseName: f.group.courseName,
          absentCount: f.absentCount,
          absentPeriods: f.absentPeriods,
          absentPercent: f.absentPercent,
          warningLevel: f.warningLevel,
          isAtRisk: f.isAtRisk,
          lastCallStatus: last ? last.status : 'Chưa phân công',
          lastCallNote: last ? last.callNote : '',
          assignedStaff: last?.assignedStaffId?.fullName || 'Hàng chờ Trưởng phòng',
        };
      })
      .sort(
        (a, b) => rank(b.warningLevel) - rank(a.warningLevel) || b.absentPeriods - a.absentPeriods,
      );

    res.json({
      metrics: {
        totalTasks,
        completedTasks,
        pendingTasks,
        retryTasks,
        unassignedTasks,
        examBanRiskCount: warningList.filter((w) => w.isAtRisk).length,
        warningCount: warningList.length,
      },
      warningLevels: levels.map((level) => ({
        ...level,
        count: warningList.filter((w) => w.warningLevel.name === level.name).length,
      })),
      courseAbsenceStats,
      reasonStats,
      warningList,
      // Kept for older clients: the exam-ban subset of warningList.
      examBanRiskList: warningList.filter((w) => w.isAtRisk),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/analytics/export-care-report
router.get(
  '/export-care-report',
  verifyToken,
  requirePermission('reports.view'),
  async (req, res, next) => {
    try {
      const scope = await reportScope(req.user);
      const tasks = await NhiemVuGoiDien.find(scope ? { studentId: { $in: scope } } : {})
        .populate('studentId', 'studentCode fullName classCode major phone parentPhone')
        .populate('courseGroupId', 'groupCode courseName')
        .populate('assignedStaffId', 'fullName email')
        .sort({ updatedAt: -1 });

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'ITC Student Care System';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('Báo Cáo Chăm Sóc');

      sheet.columns = [
        { header: 'STT', key: 'stt', width: 8 },
        { header: 'Mã SV', key: 'studentCode', width: 14 },
        { header: 'Họ và Tên Sinh Viên', key: 'fullName', width: 25 },
        { header: 'Lớp Sinh Hoạt', key: 'classCode', width: 14 },
        { header: 'Nhóm Học Phần Vắng', key: 'groupCode', width: 30 },
        { header: 'SĐT Sinh Viên', key: 'phone', width: 16 },
        { header: 'SĐT Phụ Huynh', key: 'parentPhone', width: 16 },
        { header: 'Số Lần Gọi', key: 'callAttempts', width: 12 },
        { header: 'Nhân Viên Chăm Sóc', key: 'staffName', width: 22 },
        { header: 'Trạng Thái Cuộc Gọi', key: 'status', width: 18 },
        { header: 'Ghi Chú & Lý Do Vắng', key: 'callNote', width: 35 },
        { header: 'Ngày Vắng', key: 'absenceDate', width: 15 },
      ];

      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' }, // Dark Navy
      };
      sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      tasks.forEach((t, idx) => {
        sheet.addRow({
          stt: idx + 1,
          studentCode: t.studentId?.studentCode || '',
          fullName: t.studentId?.fullName || '',
          classCode: t.studentId?.classCode || '',
          groupCode: t.courseGroupId?.groupCode || '',
          phone: t.studentId?.phone || '',
          parentPhone: t.studentId?.parentPhone || '',
          callAttempts: t.callAttempts || 0,
          staffName: t.assignedStaffId?.fullName || '',
          status: t.status ? toLabel(t.status) : '',
          callNote: t.callNote || '',
          absenceDate: t.absenceDate ? new Date(t.absenceDate).toLocaleDateString('vi-VN') : '',
        });
      });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="Bao_Cao_Tong_Hop_Cham_Soc_Sinh_Vien.xlsx"',
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
