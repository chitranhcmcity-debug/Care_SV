const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const CallTask = require('../models/CallTask');
const CourseGroup = require('../models/CourseGroup');
const Student = require('../models/Student');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');
const { verifyToken, requireStaffOrAdmin } = require('../middleware/auth');

// GET /api/attendance/course-groups (Fetch available course groups with student details)
router.get('/course-groups', verifyToken, requireStaffOrAdmin, async (req, res) => {
  try {
    const { shift, search, all } = req.query;
    let filter = {};

    // Filter strictly by assigned teacher if logged in user is Teacher or Staff
    if ((req.user?.role === 'teacher' || req.user?.role === 'staff') && all !== 'true') {
      const currentUser = await User.findById(req.user.id);
      const userFullName = currentUser ? currentUser.fullName : '';

      filter.$or = [
        { teacherId: req.user.id },
        { teacherName: userFullName }
      ];
    }

    if (shift) {
      filter.shift = shift;
    }

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      if (filter.$or) {
        filter = {
          $and: [
            { $or: filter.$or },
            { $or: [{ groupCode: searchRegex }, { courseName: searchRegex }] }
          ]
        };
      } else {
        filter.$or = [{ groupCode: searchRegex }, { courseName: searchRegex }];
      }
    }

    const groups = await CourseGroup.find(filter)
      .populate('students')
      .populate('teacherId', 'fullName email')
      .sort({ groupCode: 1 });

    res.json(groups);
  } catch (error) {
    console.error('Fetch course groups error:', error);
    res.status(500).json({ message: 'Không thể lấy danh sách nhóm học phần' });
  }
});

// GET /api/attendance/history/:courseGroupId (Fetch attendance history for a course group)
router.get('/history/:courseGroupId', verifyToken, requireStaffOrAdmin, async (req, res) => {
  try {
    const history = await Attendance.find({ courseGroupId: req.params.courseGroupId })
      .populate('absentStudents', 'studentCode fullName classCode phone parentPhone')
      .populate('excusedStudents.studentId', 'studentCode fullName classCode phone parentPhone')
      .populate('recordedBy', 'fullName email')
      .sort({ date: -1 });

    res.json(history);
  } catch (error) {
    console.error('Fetch attendance history error:', error);
    res.status(500).json({ message: 'Không thể lấy lịch sử điểm danh' });
  }
});

// GET /api/attendance/today/:courseGroupId
// Kiểm tra buổi điểm danh hôm nay đã được lưu chưa
router.get('/today/:courseGroupId', verifyToken, requireStaffOrAdmin, async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const todayRecord = await Attendance.findOne({
      courseGroupId: req.params.courseGroupId,
      date: { $gte: startOfDay, $lte: endOfDay },
    })
      .populate('absentStudents', 'studentCode fullName classCode phone parentPhone')
      .populate('excusedStudents.studentId', 'studentCode fullName classCode phone parentPhone')
      .populate('recordedBy', 'fullName email');

    // Trả về null nếu chưa điểm danh hôm nay
    res.json(todayRecord || null);
  } catch (error) {
    console.error('Today attendance check error:', error);
    res.status(500).json({ message: 'Lỗi kiểm tra điểm danh hôm nay' });
  }
});

// GET /api/attendance/schedule/:courseGroupId
// Lấy TẤT CẢ buổi học theo lịch (có và chưa điểm danh)
router.get('/schedule/:courseGroupId', verifyToken, requireStaffOrAdmin, async (req, res) => {
  try {
    const CourseGroup = require('../models/CourseGroup');
    const cg = await CourseGroup.findById(req.params.courseGroupId);
    if (!cg) return res.status(404).json({ message: 'Không tìm thấy học phần' });

    // Map tên thứ → JS getDay() (0=CN, 1=T2...)
    const dayMap = {
      'Thứ 2': 1, 'Thứ 3': 2, 'Thứ 4': 3,
      'Thứ 5': 4, 'Thứ 6': 5, 'Thứ 7': 6, 'Chủ Nhật': 0,
    };
    const scheduledDayNums = (cg.scheduleDays || []).map(d => dayMap[d]).filter(d => d !== undefined);

    // Phạm vi: startDate → endDate (toàn bộ học kỳ, bao gồm cả buổi tương lai)
    const start = cg.startDate ? new Date(cg.startDate) : null;
    const end   = cg.endDate   ? new Date(cg.endDate)   : null;

    // Nếu chưa cấu hình startDate → fallback về lịch sử đã ghi
    if (!start) {
      const history = await Attendance.find({ courseGroupId: cg._id })
        .populate('absentStudents', 'studentCode fullName classCode phone parentPhone')
        .populate('excusedStudents.studentId', 'studentCode fullName classCode phone parentPhone')
        .populate('recordedBy', 'fullName email')
        .sort({ date: 1 });

      const sessions = history.map(att => ({
        scheduledDate: att.date,
        status: 'recorded',
        attendance: att,
      }));
      return res.json({ hasDates: false, sessions, courseGroup: cg });
    }

    // Helper: so sánh ngày theo local date string (tránh lỗi timezone)
    const toLocalDateStr = (d) => {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
    };
    const todayStr = toLocalDateStr(new Date());

    // endLimit = endDate nếu có, ngược lại lấy 90 ngày từ startDate
    const endLimit = end ? new Date(end) : (() => { const d = new Date(start); d.setDate(d.getDate() + 90); return d; })();
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
    const records = await Attendance.find({ courseGroupId: cg._id })
      .populate('absentStudents', 'studentCode fullName classCode phone parentPhone')
      .populate('excusedStudents.studentId', 'studentCode fullName classCode phone parentPhone')
      .populate('recordedBy', 'fullName email')
      .sort({ date: 1 });

    // Ghép: với mỗi ngày lịch, tìm bản ghi điểm danh tương ứng
    const matchedRecordIds = new Set();
    const sessions = allScheduledDates.map(date => {
      const dateStr = toLocalDateStr(date);
      const rec = records.find(r => toLocalDateStr(r.date) === dateStr);
      if (rec) matchedRecordIds.add(rec._id.toString());

      const isPast   = toLocalDateStr(date) < todayStr;
      const isToday  = toLocalDateStr(date) === todayStr;

      let status;
      if (rec)                   status = 'recorded';
      else if (isPast || isToday) status = 'missing';
      else                        status = 'future';

      return { scheduledDate: date, status, attendance: rec || null };
    });

    // Thêm các bản ghi điểm danh không nằm trong lịch (ngoài startDate hoặc lệch lịch)
    const orphanRecords = records.filter(r => !matchedRecordIds.has(r._id.toString()));
    orphanRecords.forEach(rec => {
      sessions.push({
        scheduledDate: rec.date,
        status: 'recorded',
        attendance: rec,
      });
    });

    // Sort lại theo ngày
    sessions.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));

    res.json({ hasDates: true, sessions, courseGroup: cg });
  } catch (error) {
    console.error('Schedule sessions error:', error);
    res.status(500).json({ message: 'Lỗi lấy lịch buổi học' });
  }
});

// PUT /api/attendance/history/:attendanceId (Update past attendance session)
router.put('/history/:attendanceId', verifyToken, requireStaffOrAdmin, async (req, res) => {
  try {
    const { absentStudentIds, excusedStudents } = req.body;
    const absentList = Array.isArray(absentStudentIds) ? absentStudentIds : [];
    const excusedList = Array.isArray(excusedStudents) ? excusedStudents : [];

    const updated = await Attendance.findByIdAndUpdate(
      req.params.attendanceId,
      { absentStudents: absentList, excusedStudents: excusedList },
      { new: true }
    )
      .populate('absentStudents', 'studentCode fullName classCode phone parentPhone')
      .populate('excusedStudents.studentId', 'studentCode fullName classCode phone parentPhone')
      .populate('recordedBy', 'fullName email');

    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi điểm danh' });
    }

    res.json({ message: 'Cập nhật lịch sử điểm danh thành công!', attendance: updated });
  } catch (error) {
    console.error('Update attendance history error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật lịch sử điểm danh' });
  }
});

// DELETE /api/attendance/history/:attendanceId (Delete attendance record)
router.delete('/history/:attendanceId', verifyToken, requireStaffOrAdmin, async (req, res) => {
  try {
    const deleted = await Attendance.findByIdAndDelete(req.params.attendanceId);
    if (!deleted) {
      return res.status(404).json({ message: 'Không tìm thấy bản ghi điểm danh' });
    }
    res.json({ message: 'Đã xóa bản ghi điểm danh!' });
  } catch (error) {
    console.error('Delete attendance error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa bản ghi điểm danh' });
  }
});

// GET /api/attendance/summary/:courseGroupId
// Trả về bảng tóm tắt vắng: mỗi SV vắng bao nhiêu buổi
router.get('/summary/:courseGroupId', verifyToken, requireStaffOrAdmin, async (req, res) => {
  try {
    const { courseGroupId } = req.params;

    const group = await CourseGroup.findById(courseGroupId).populate(
      'students',
      'studentCode fullName classCode phone parentPhone major'
    );

    if (!group) {
      return res.status(404).json({ message: 'Không tìm thấy nhóm học phần' });
    }

    const allAttendance = await Attendance.find({ courseGroupId }).sort({ date: 1 });
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
          const sid = item.studentId ? (typeof item.studentId === 'object' ? item.studentId._id : item.studentId).toString() : '';
          if (sid) {
            excusedCountMap[sid] = (excusedCountMap[sid] || 0) + 1;
          }
        }
      }
    }

    // Get call task status for each student
    const callTasks = await CallTask.find({ courseGroupId })
      .populate('assignedStaffId', 'fullName')
      .sort({ createdAt: -1 });

    const latestTaskMap = {};
    for (const task of callTasks) {
      const sid = task.studentId.toString();
      if (!latestTaskMap[sid]) {
        latestTaskMap[sid] = task;
      }
    }

    // Get exam ban threshold from settings
    const settings = await SystemSettings.findOne();
    const examBanThreshold = settings?.examBanThreshold || 2;

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
        isAtRisk: absentCount >= examBanThreshold,
        callStatus: latestTask?.status || null,
        callNote: latestTask?.callNote || null,
        assignedStaff: latestTask?.assignedStaffId?.fullName || null,
      };
    });

    // Sort: at-risk first, then by absent count desc
    summary.sort((a, b) => {
      if (b.isAtRisk !== a.isAtRisk) return b.isAtRisk ? 1 : -1;
      return b.absentCount - a.absentCount;
    });

    res.json({
      courseGroup: {
        _id: group._id,
        groupCode: group.groupCode,
        courseName: group.courseName,
        shift: group.shift,
        room: group.room,
      },
      totalSessions,
      examBanThreshold,
      summary,
    });
  } catch (error) {
    console.error('Attendance summary error:', error);
    res.status(500).json({ message: 'Không thể lấy tóm tắt điểm danh' });
  }
});

// POST /api/attendance/submit
router.post('/submit', verifyToken, requireStaffOrAdmin, async (req, res) => {
  try {
    const { courseGroupId, absentStudentIds, excusedStudents, teacherId } = req.body;

    if (!courseGroupId) {
      return res.status(400).json({ message: 'Mã nhóm học phần là bắt buộc' });
    }

    const group = await CourseGroup.findById(courseGroupId);
    if (!group) {
      return res.status(404).json({ message: 'Không tìm thấy nhóm học phần' });
    }

    // Strict Authorization Check: Only assigned teacher or admin can submit attendance
    if (req.user?.role === 'teacher' || req.user?.role === 'staff') {
      const currentUser = await User.findById(req.user.id);
      const userFullName = currentUser ? currentUser.fullName : '';
      const isAssignedTeacher =
        (group.teacherId && group.teacherId.toString() === req.user.id.toString()) ||
        (group.teacherName && group.teacherName.trim() === userFullName.trim());

      if (!isAssignedTeacher && req.user?.role !== 'admin') {
        return res.status(403).json({
          message: `Lỗi phân quyền: Bạn không phải giảng viên phụ trách học phần "${group.courseName}". Người phụ trách hiện tại: ${group.teacherName || 'Chưa phân công'}.`
        });
      }
    }

    const absentList = Array.isArray(absentStudentIds) ? absentStudentIds : [];
    const excusedList = Array.isArray(excusedStudents) ? excusedStudents : [];

    // ─── Kiểm tra đã điểm danh cho ngày này chưa (dùng date truyền vào hoặc mặc định hôm nay) ───
    const targetDate = req.body.date ? new Date(req.body.date) : new Date();
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
    const endOfDay   = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

    const existingRecord = await Attendance.findOne({
      courseGroupId,
      date: { $gte: startOfDay, $lte: endOfDay },
    });

    let attendance;
    let isUpdate = false;

    if (existingRecord) {
      // Đã điểm danh ngày này → cập nhật bản ghi cũ thay vì tạo mới
      existingRecord.absentStudents = absentList;
      existingRecord.excusedStudents = excusedList;
      existingRecord.recordedBy = teacherId || req.user?.id;
      await existingRecord.save();
      attendance = existingRecord;
      isUpdate = true;
    } else {
      // Chưa điểm danh ngày này → tạo mới
      attendance = new Attendance({
        courseGroupId,
        absentStudents: absentList,
        excusedStudents: excusedList,
        recordedBy: teacherId || req.user?.id,
        date: targetDate,
      });
      await attendance.save();
    }

    let createdTasksCount = 0;
    const taskAssignments = [];

    if (absentList.length > 0) {
      const settings = (await SystemSettings.findOne()) || {};
      const assignmentRule = settings.taskAssignmentRule || 'round-robin';

      // Tìm nhân viên CSKH đang hoạt động (không phải admin)
      let activeStaffs = await User.find({ role: 'staff', status: 'active' });
      if (activeStaffs.length === 0) {
        activeStaffs = await User.find({ status: 'active' });
      }

      if (activeStaffs.length > 0) {
        const N = activeStaffs.length;

        // ─── SMART DEDUP: Chỉ tạo task cho SV chưa có task hôm nay ───
        // Lấy toàn bộ task đã gán cho attendance record này
        const existingTasks = await CallTask.find({
          studentId: { $in: absentList },
          courseGroupId,
          absenceDate: { $gte: startOfDay, $lte: endOfDay },
        });
        const alreadyHasTask = new Set(existingTasks.map(t => t.studentId.toString()));

        // Chỉ xử lý sinh viên chưa có task hôm nay
        const newAbsentIds = absentList.filter(id => !alreadyHasTask.has(id.toString()));

        if (newAbsentIds.length > 0) {
          // Xác định startIndex cho round-robin
          let startIndex = 0;
          if (assignmentRule === 'least-tasks') {
            const taskCounts = await Promise.all(
              activeStaffs.map(async (staff) => {
                const count = await CallTask.countDocuments({
                  assignedStaffId: staff._id,
                  status: { $in: ['Chưa gọi', 'Không bắt máy'] }
                });
                return { staff, count };
              })
            );
            taskCounts.sort((a, b) => a.count - b.count);
            startIndex = activeStaffs.indexOf(taskCounts[0].staff);
          }

          // Lấy thông tin sinh viên
          const absentStudents = await Student.find({ _id: { $in: newAbsentIds } });
          const studentMap = {};
          for (const st of absentStudents) {
            studentMap[st._id.toString()] = st;
          }

          const tasksToInsert = newAbsentIds.map((studentId, i) => {
            const student = studentMap[studentId.toString()];
            const studentClassCode = (student?.classCode || '').trim().toUpperCase();

            // Tier 1: Check managedStudents match (individual student exception assignment)
            let assignedStaff = activeStaffs.find(
              (s) => Array.isArray(s.managedStudents) && s.managedStudents.some(msId => msId.toString() === studentId.toString())
            );

            // Tier 2: Check managedClasses match (base cohort class assignment via student.classCode)
            if (!assignedStaff) {
              assignedStaff = activeStaffs.find(
                (s) => Array.isArray(s.managedClasses) && s.managedClasses.includes(studentClassCode)
              );
            }

            // Tier 3: Fallback round-robin / least-busy active staff assignment
            if (!assignedStaff) {
              assignedStaff = activeStaffs[(startIndex + i) % N];
            }

            taskAssignments.push({
              staffName: assignedStaff.fullName,
              studentName: student?.fullName || studentId,
              studentCode: student?.studentCode || '',
              classCode: studentClassCode,
            });

            return {
              studentId,
              courseGroupId,
              assignedStaffId: assignedStaff._id,
              absenceDate: new Date(),
              status: 'Chưa gọi',
              callNote: '',
              callAttempts: 0,
            };
          });

          const createdTasks = await CallTask.insertMany(tasksToInsert);
          createdTasksCount = createdTasks.length;
        }
      }
    }

    const actionLabel = isUpdate ? 'Cập nhật' : 'Lưu';
    const taskNote = absentList.length > 0
      ? (createdTasksCount > 0
          ? `Đã phân công ${createdTasksCount} SV vắng cho ${new Set(taskAssignments.map(t => t.staffName)).size} nhân viên CSKH.`
          : 'Các SV vắng đã được phân công trước đó.')
      : 'Không có sinh viên vắng.';

    res.status(isUpdate ? 200 : 201).json({
      message: `✅ ${actionLabel} điểm danh thành công! ${taskNote}`,
      attendance,
      createdTasksCount,
      taskAssignments,
      isUpdate,
    });
  } catch (error) {
    console.error('Submit attendance error:', error);
    res.status(500).json({ message: 'Lỗi khi lưu điểm danh' });
  }
});

module.exports = router;
