const ExcelJS = require('exceljs');
const DiemDanh = require('../models/DiemDanh');
const HoSoChamSoc = require('../models/HoSoChamSoc');
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const { can } = require('../services/dichVuPhanQuyen');
const { getWarningLevels, periodInfo, evaluate } = require('../services/dichVuCanhBao');
const { CARE_STATUS, toLabel } = require('../utils/hangSo');

// So khớp nguyên từ để từ khóa ngắn như "ca" không trúng "các", "cả", "cái"...
// Kiểm tra theo thứ tự; nhóm đầu tiên khớp sẽ thắng.
const wholeWords = (words) => new RegExp(`(^|[^\\p{L}])(${words.join('|')})([^\\p{L}]|$)`, 'u');
const REASON_PATTERNS = [
  { reason: 'Ốm / Sức khỏe', pattern: wholeWords(['ốm', 'bệnh', 'sốt', 'viện', 'sức khỏe']) },
  { reason: 'Bận việc gia đình', pattern: wholeWords(['gia đình', 'quê', 'việc nhà']) },
  { reason: 'Bận đi làm', pattern: wholeWords(['làm', 'đi làm', 'ca']) },
  { reason: 'Quên lịch học', pattern: wholeWords(['quên', 'ngủ']) },
];

/**
 * Sinh viên mà người gọi được xem báo cáo: mọi người có students.view (Trưởng phòng, admin chỉ đọc),
 * nếu không thì các lớp sinh hoạt được giao cho họ và sinh viên thuộc hồ sơ chăm sóc họ được chỉ đạo
 * được chỉ đạo (Nhân viên CSSV). null = tất cả.
 */
async function reportScope(user) {
  if (can(user, 'students.view')) return null;
  const classes = user.managedClasses || [];
  const [inClasses, directed] = await Promise.all([
    SinhVien.find({ classCode: { $in: classes } }).select('_id'),
    HoSoChamSoc.find({ assignedStaffId: user.id }).select('studentId'),
  ]);
  return [...inClasses.map((st) => st._id), ...directed.map((c) => c.studentId)];
}

async function getSummary(req, res, next) {
  try {
    const scope = await reportScope(req.user);
    const caseFilter = scope ? { studentId: { $in: scope } } : {};
    const count = (status) => HoSoChamSoc.countDocuments({ ...caseFilter, status });
    const [totalCases, awaitingCases, inProgressCases, closingCases, closedCases] =
      await Promise.all([
        HoSoChamSoc.countDocuments(caseFilter),
        count(CARE_STATUS.AWAITING),
        count(CARE_STATUS.IN_PROGRESS),
        count(CARE_STATUS.CLOSING),
        count(CARE_STATUS.CLOSED),
      ]);

    // 1. Số buổi vắng theo (học phần, sinh viên), giới hạn trong phạm vi của người gọi.
    const scopeSet = scope ? new Set(scope.map(String)) : null;
    const attendances = await DiemDanh.find({}).select('courseGroupId absentStudents').lean();
    const perGroup = new Map(); // groupId -> Map(studentId -> số buổi vắng)
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

    // 2. Thống kê lý do từ nguyên nhân nhân viên ghi trong hồ sơ chăm sóc.
    const casesWithCause = await HoSoChamSoc.find({ ...caseFilter, cause: { $ne: '' } })
      .select('cause')
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
    for (const c of casesWithCause)
      reasonCounts[classifyReason(c.cause.toLowerCase()) || 'Lý do khác']++;
    const reasonStats = Object.keys(reasonCounts).map((key) => ({
      reason: key,
      count: reasonCounts[key],
    }));

    // 3. Sinh viên đạt bất kỳ mức cảnh báo đã cấu hình (số tiết / % tổng số tiết).
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
    const cases = await HoSoChamSoc.find({ studentId: { $in: flagged.map((f) => f.sid) } })
      .select('studentId status cause assignedStaffId')
      .populate('assignedStaffId', 'fullName')
      .sort({ createdAt: -1 })
      .lean();
    const lastCaseMap = new Map();
    for (const c of cases)
      if (!lastCaseMap.has(String(c.studentId))) lastCaseMap.set(String(c.studentId), c);
    const rank = (level) => levels.findIndex((l) => l.name === level.name);
    const warningList = flagged
      .filter((f) => studentMap.has(f.sid))
      .map((f) => {
        const last = lastCaseMap.get(f.sid);
        return {
          student: studentMap.get(f.sid),
          courseCode: f.group.groupCode,
          courseName: f.group.courseName,
          absentCount: f.absentCount,
          absentPeriods: f.absentPeriods,
          absentPercent: f.absentPercent,
          warningLevel: f.warningLevel,
          isAtRisk: f.isAtRisk,
          careCaseId: last?._id || null,
          careStatus: last?.status || null,
          careCause: last?.cause || '',
          assignedStaff: last?.assignedStaffId?.fullName || '',
        };
      })
      .sort(
        (a, b) => rank(b.warningLevel) - rank(a.warningLevel) || b.absentPeriods - a.absentPeriods,
      );

    res.json({
      metrics: {
        totalCases,
        awaitingCases,
        inProgressCases,
        closingCases,
        closedCases,
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
      // Giữ cho client cũ: tập con cấm thi của warningList.
      examBanRiskList: warningList.filter((w) => w.isAtRisk),
    });
  } catch (error) {
    next(error);
  }
}

async function exportCareReport(req, res, next) {
  try {
    const scope = await reportScope(req.user);
    const cases = await HoSoChamSoc.find(scope ? { studentId: { $in: scope } } : {})
      .select('-notes')
      .populate('studentId', 'studentCode fullName classCode major phone parentPhone')
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
      { header: 'SĐT Sinh Viên', key: 'phone', width: 16 },
      { header: 'SĐT Phụ Huynh', key: 'parentPhone', width: 16 },
      { header: 'Lý Do Mở Hồ Sơ', key: 'reason', width: 35 },
      { header: 'Nhân Viên Chăm Sóc', key: 'staffName', width: 22 },
      { header: 'Trạng Thái', key: 'status', width: 18 },
      { header: 'Các Bước', key: 'steps', width: 12 },
      { header: 'Nguyên Nhân', key: 'cause', width: 30 },
      { header: 'Hướng Giải Quyết', key: 'solution', width: 30 },
      { header: 'Kết Quả', key: 'result', width: 24 },
      { header: 'Ngày Mở', key: 'openedAt', width: 14 },
      { header: 'Ngày Kết Thúc', key: 'closedAt', width: 14 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' }, // Xanh navy đậm
    };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    const day = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '');
    cases.forEach((c, idx) => {
      sheet.addRow({
        stt: idx + 1,
        studentCode: c.studentId?.studentCode || '',
        fullName: c.studentId?.fullName || '',
        classCode: c.studentId?.classCode || '',
        phone: c.studentId?.phone || '',
        parentPhone: c.studentId?.parentPhone || '',
        reason: c.reason || '',
        staffName: c.assignedStaffId?.fullName || '',
        status: toLabel(c.status),
        steps: `${c.steps.filter((st) => st.done).length}/${c.steps.length}`,
        cause: c.cause || '',
        solution: c.solution || '',
        result: c.closing?.result ? toLabel(c.closing.result) : '',
        openedAt: day(c.createdAt),
        closedAt: day(c.closing?.closedAt),
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
}

module.exports = { getSummary, exportCareReport };
