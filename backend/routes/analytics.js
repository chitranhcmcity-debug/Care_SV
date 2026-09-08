const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const Attendance = require('../models/Attendance');
const CallTask = require('../models/CallTask');
const Student = require('../models/Student');
const CourseGroup = require('../models/CourseGroup');
const SystemSettings = require('../models/SystemSettings');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// GET /api/analytics/summary
router.get('/summary', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const settings = (await SystemSettings.findOne()) || { examBanThreshold: 3 };
    const banThreshold = settings.examBanThreshold ?? 3;

    const totalTasks = await CallTask.countDocuments();
    const completedTasks = await CallTask.countDocuments({ status: 'Đã liên hệ' });
    const pendingTasks = await CallTask.countDocuments({ status: 'Chưa gọi' });
    const retryTasks = await CallTask.countDocuments({ status: 'Không bắt máy' });

    // 1. Group absences by CourseGroup
    const attendances = await Attendance.find({}).populate('courseGroupId', 'groupCode courseName');
    const courseAbsenceMap = {};

    for (const att of attendances) {
      const gCode = att.courseGroupId?.groupCode || 'Khác';
      const count = (att.absentStudents || []).length;
      courseAbsenceMap[gCode] = (courseAbsenceMap[gCode] || 0) + count;
    }

    const courseAbsenceStats = Object.keys(courseAbsenceMap).map((code) => ({
      courseCode: code,
      absentCount: courseAbsenceMap[code],
    }));

    // 2. Reason extraction breakdown from CallTask notes
    const tasksWithNotes = await CallTask.find({ callNote: { $ne: '' } });
    const reasonCounts = {
      'Ốm / Sức khỏe': 0,
      'Bận việc gia đình': 0,
      'Bận đi làm': 0,
      'Quên lịch học': 0,
      'Lý do khác': 0,
    };

    for (const task of tasksWithNotes) {
      const note = (task.callNote || '').toLowerCase();
      if (
        note.includes('ốm') ||
        note.includes('bệnh') ||
        note.includes('sốt') ||
        note.includes('viện')
      ) {
        reasonCounts['Ốm / Sức khỏe']++;
      } else if (note.includes('gia đình') || note.includes('quê') || note.includes('việc nhà')) {
        reasonCounts['Bận việc gia đình']++;
      } else if (note.includes('làm') || note.includes('ca')) {
        reasonCounts['Bận đi làm']++;
      } else if (note.includes('quên') || note.includes('ngủ')) {
        reasonCounts['Quên lịch học']++;
      } else {
        reasonCounts['Lý do khác']++;
      }
    }

    const reasonStats = Object.keys(reasonCounts).map((key) => ({
      reason: key,
      count: reasonCounts[key],
    }));

    // 3. Exam Ban Risk List (Students absent >= 2 times in any course group)
    // Find all attendance records and aggregate student absence counts per course group
    const studentCourseAbsenceMap = {}; // key: `${studentId}_${courseGroupId}`

    for (const att of attendances) {
      if (!att.courseGroupId) continue;
      const gId = att.courseGroupId._id.toString();

      for (const stId of att.absentStudents || []) {
        const key = `${stId.toString()}_${gId}`;
        if (!studentCourseAbsenceMap[key]) {
          studentCourseAbsenceMap[key] = {
            studentId: stId.toString(),
            courseGroupId: gId,
            courseCode: att.courseGroupId.groupCode,
            courseName: att.courseGroupId.courseName,
            absentCount: 0,
          };
        }
        studentCourseAbsenceMap[key].absentCount++;
      }
    }

    // Filter students absent >= banThreshold times
    const atRiskKeys = Object.keys(studentCourseAbsenceMap).filter(
      (k) => studentCourseAbsenceMap[k].absentCount >= banThreshold,
    );

    const examBanRiskList = [];

    for (const k of atRiskKeys) {
      const item = studentCourseAbsenceMap[k];
      const studentObj = await Student.findById(item.studentId).select(
        'studentCode fullName classCode major phone parentPhone',
      );
      if (!studentObj) continue;

      // Find last call task status for this student & course
      const lastTask = await CallTask.findOne({
        studentId: item.studentId,
        courseGroupId: item.courseGroupId,
      })
        .populate('assignedStaffId', 'fullName email')
        .sort({ updatedAt: -1 });

      examBanRiskList.push({
        student: studentObj,
        courseCode: item.courseCode,
        courseName: item.courseName,
        absentCount: item.absentCount,
        lastCallStatus: lastTask ? lastTask.status : 'Chưa phân công',
        lastCallNote: lastTask ? lastTask.callNote : '',
        assignedStaff: lastTask?.assignedStaffId?.fullName || 'Chưa gán',
      });
    }

    res.json({
      metrics: {
        totalTasks,
        completedTasks,
        pendingTasks,
        retryTasks,
        examBanRiskCount: examBanRiskList.length,
      },
      courseAbsenceStats,
      reasonStats,
      examBanRiskList,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/analytics/export-care-report
router.get('/export-care-report', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const tasks = await CallTask.find({})
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
        status: t.status || '',
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
});

module.exports = router;
