const { CALL_STATUS, CALL_STATUSES, toLabel, isManagement } = require('../utils/hangSo');
const { requireStudentAccess } = require('../middleware/phanQuyen');
const { assert, validateId } = require('../utils/kiemTra');
const express = require('express');
const router = express.Router();
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const {
  verifyToken,
  requireSignedIn,
  requireAdmin,
  requireManagement,
  requireRoles,
} = require('../middleware/xacThuc');

// POST /api/call-tasks/cleanup-duplicates (Admin xóa task trùng)
router.post('/cleanup-duplicates', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const all = await NhiemVuGoiDien.find().sort({ createdAt: 1 }); // giữ task cũ nhất
    const seen = new Map();
    const toDelete = [];
    for (const t of all) {
      const dateStr = new Date(t.absenceDate).toDateString();
      const key = `${t.studentId}_${t.courseGroupId}_${dateStr}`;
      if (seen.has(key)) {
        toDelete.push(t._id);
      } else {
        seen.set(key, t._id);
      }
    }
    if (toDelete.length > 0) {
      await NhiemVuGoiDien.deleteMany({ _id: { $in: toDelete } });
    }
    const remaining = await NhiemVuGoiDien.countDocuments();
    res.json({
      deleted: toDelete.length,
      remaining,
      message: `Đã xóa ${toDelete.length} task trùng`,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/call-tasks/unread-count (Returns count of pending assigned tasks for header badge)
router.get('/unread-count', verifyToken, requireSignedIn, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const count = await NhiemVuGoiDien.countDocuments({
      assignedStaffId: userId,
      status: CALL_STATUS.PENDING,
    });
    res.json({ unreadCount: count });
  } catch (error) {
    next(error);
  }
});

// GET /api/call-tasks/admin-all (Admin xem tất cả task của mọi nhân viên)
router.get('/admin-all', verifyToken, requireManagement, async (req, res, next) => {
  try {
    const { status, groupCode, classCode } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const now = new Date();

    let tasks = await NhiemVuGoiDien.find(filter)
      .populate('studentId', 'studentCode fullName classCode dob major phone parentPhone tags')
      .populate('courseGroupId', 'groupCode courseName')
      .populate('assignedStaffId', 'fullName email')
      .sort({ createdAt: -1 });

    if (groupCode) {
      tasks = tasks.filter(
        (t) => t.courseGroupId?.groupCode?.toLowerCase() === String(groupCode).toLowerCase(),
      );
    }
    if (classCode) {
      tasks = tasks.filter(
        (t) => t.studentId?.classCode?.toLowerCase() === String(classCode).toLowerCase(),
      );
    }

    // Map sang tên field thân thiện cho frontend
    const mapped = tasks.map((t) => ({
      _id: t._id,
      student: t.studentId,
      courseGroup: t.courseGroupId,
      assignedStaff: t.assignedStaffId,
      absenceDate: t.absenceDate,
      callStatus: t.status,
      callNote: t.callNote,
      absenceReasonCategory: t.absenceReasonCategory || '',
      callbackDate: t.callbackDate || null,
      isCallbackDue: t.callbackDate ? new Date(t.callbackDate) <= now : false,
      callAttempts: t.callAttempts,
      createdAt: t.createdAt,
    }));

    res.json(mapped);
  } catch (error) {
    next(error);
  }
});

// GET /api/call-tasks/my-tasks (Supports optional classCode, groupCode, status filters)
router.get('/my-tasks', verifyToken, requireSignedIn, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { classCode, groupCode, status } = req.query;

    const filter = { assignedStaffId: userId };
    if (status) filter.status = status;

    let tasks = await NhiemVuGoiDien.find(filter)
      .populate('studentId', 'studentCode fullName classCode dob major phone parentPhone tags')
      .populate('courseGroupId', 'groupCode courseName')
      .sort({ createdAt: -1 });

    // Apply populated filters
    if (classCode) {
      tasks = tasks.filter(
        (t) => t.studentId?.classCode?.toLowerCase() === String(classCode).toLowerCase(),
      );
    }
    if (groupCode) {
      tasks = tasks.filter(
        (t) => t.courseGroupId?.groupCode?.toLowerCase() === String(groupCode).toLowerCase(),
      );
    }

    // Sort priority:
    // 1. Due Callback (callbackDate <= now) comes FIRST!
    // 2. Status queue: CALL_STATUS.PENDING (0) -> CALL_STATUS.UNREACHABLE (1) -> CALL_STATUS.CONTACTED (2)
    // 3. Newest createdAt first
    const now = new Date();
    const priorityMap = {
      [CALL_STATUS.PENDING]: 0,
      [CALL_STATUS.UNREACHABLE]: 1,
      [CALL_STATUS.CONTACTED]: 2,
    };

    tasks.sort((a, b) => {
      const isCallbackDueA = a.callbackDate && new Date(a.callbackDate) <= now ? 0 : 1;
      const isCallbackDueB = b.callbackDate && new Date(b.callbackDate) <= now ? 0 : 1;
      if (isCallbackDueA !== isCallbackDueB) return isCallbackDueA - isCallbackDueB;

      const pA = priorityMap[a.status] !== undefined ? priorityMap[a.status] : 99;
      const pB = priorityMap[b.status] !== undefined ? priorityMap[b.status] : 99;
      if (pA !== pB) return pA - pB;

      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Map sang tên field thân thiện cho frontend
    const mapped = tasks.map((t) => ({
      _id: t._id,
      student: t.studentId,
      courseGroup: t.courseGroupId,
      absenceDate: t.absenceDate,
      callStatus: t.status,
      callNote: t.callNote,
      absenceReasonCategory: t.absenceReasonCategory || '',
      callbackDate: t.callbackDate || null,
      isCallbackDue: t.callbackDate ? new Date(t.callbackDate) <= now : false,
      callAttempts: t.callAttempts,
      createdAt: t.createdAt,
    }));

    res.json(mapped);
  } catch (error) {
    next(error);
  }
});

// PUT /api/call-tasks/:id/update
router.put('/:id/update', verifyToken, requireRoles('admin', 'staff'), async (req, res, next) => {
  try {
    const { status, callNote, absenceReasonCategory, callbackDate, tags } = req.body;
    const taskId = req.params.id;
    validateId(taskId);
    assert(status === undefined || CALL_STATUSES.includes(status), 'Invalid call status');
    assert(callNote === undefined || typeof callNote === 'string', 'Invalid call note');
    assert(
      absenceReasonCategory === undefined || typeof absenceReasonCategory === 'string',
      'Invalid absence reason',
    );
    assert(
      callbackDate === undefined ||
        callbackDate === null ||
        callbackDate === '' ||
        (typeof callbackDate === 'string' && !Number.isNaN(Date.parse(callbackDate))),
      'Invalid callback date',
    );
    assert(
      tags === undefined || (Array.isArray(tags) && tags.every((t) => typeof t === 'string')),
      'Invalid tags',
    );

    const task = await NhiemVuGoiDien.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy nhiệm vụ cuộc gọi' });
    }

    assert(
      isManagement(req.user) || String(task.assignedStaffId) === req.user.id,
      'Task is not assigned to you',
      403,
    );

    const previousStatus = task.status;
    if (status && CALL_STATUSES.includes(status)) {
      task.status = status;
    }
    if (callNote !== undefined) {
      task.callNote = callNote;
    }
    if (absenceReasonCategory !== undefined) {
      task.absenceReasonCategory = absenceReasonCategory;
    }
    if (callbackDate !== undefined) {
      task.callbackDate = callbackDate ? new Date(callbackDate) : null;
    }

    // Count a call attempt only when an outcome is recorded: the status changes,
    // or a retry is logged as unreachable. Editing notes/tags alone is not a call.
    if (status && (status !== previousStatus || status === CALL_STATUS.UNREACHABLE)) {
      task.callAttempts = (task.callAttempts || 0) + 1;
    }

    await task.save();

    // If student tags were provided in update, save them to SinhVien model as well
    if (Array.isArray(tags) && task.studentId) {
      const SinhVien = require('../models/SinhVien');
      await SinhVien.findByIdAndUpdate(task.studentId, { tags });
    }

    const updatedTask = await NhiemVuGoiDien.findById(taskId)
      .populate('studentId', 'studentCode fullName classCode dob major phone parentPhone tags')
      .populate('courseGroupId', 'groupCode courseName');

    const mapped = {
      _id: updatedTask._id,
      student: updatedTask.studentId,
      courseGroup: updatedTask.courseGroupId,
      absenceDate: updatedTask.absenceDate,
      callStatus: updatedTask.status,
      callNote: updatedTask.callNote,
      absenceReasonCategory: updatedTask.absenceReasonCategory || '',
      callbackDate: updatedTask.callbackDate || null,
      callAttempts: updatedTask.callAttempts,
      createdAt: updatedTask.createdAt,
    };

    res.json({ message: 'Cập nhật cuộc gọi thành công!', task: mapped });
  } catch (error) {
    next(error);
  }
});

// GET /api/call-tasks/student-360/:studentId (Education CRM - Profile 360 Timeline)
router.get(
  '/student-360/:studentId',
  verifyToken,
  requireSignedIn,
  requireStudentAccess,
  async (req, res, next) => {
    try {
      const SinhVien = require('../models/SinhVien');
      const DiemDanh = require('../models/DiemDanh');

      const student = await SinhVien.findById(req.params.studentId);
      if (!student) {
        return res.status(404).json({ message: 'Không tìm thấy thông tin sinh viên' });
      }

      // Fetch call tasks history for this student
      const callTasks = await NhiemVuGoiDien.find({ studentId: student._id })
        .populate('courseGroupId', 'groupCode courseName')
        .populate('assignedStaffId', 'fullName email')
        .sort({ createdAt: -1 });

      // Fetch attendance history for this student across all course groups
      const attendanceRecords = await DiemDanh.find({
        $or: [{ absentStudents: student._id }, { 'excusedStudents.studentId': student._id }],
      })
        .populate('courseGroupId', 'groupCode courseName')
        .populate('recordedBy', 'fullName email')
        .sort({ date: -1 });

      // Combine timeline entries
      const timeline = [];

      callTasks.forEach((ct) => {
        timeline.push({
          type: 'call_task',
          date: ct.createdAt,
          title: `Cuộc gọi CSKH: ${toLabel(ct.status)}`,
          courseGroup: ct.courseGroupId,
          staff: ct.assignedStaffId,
          status: ct.status,
          note: ct.callNote,
          absenceReasonCategory: ct.absenceReasonCategory,
          callbackDate: ct.callbackDate,
          callAttempts: ct.callAttempts,
        });
      });

      attendanceRecords.forEach((att) => {
        const isAbsent = att.absentStudents.some((id) => id.toString() === student._id.toString());
        const excusedItem = att.excusedStudents.find(
          (item) => item.studentId?.toString() === student._id.toString(),
        );

        timeline.push({
          type: 'attendance',
          date: att.date,
          title: isAbsent ? 'Báo Vắng Học' : 'Vắng Có Lý Do',
          courseGroup: att.courseGroupId,
          staff: att.recordedBy,
          status: isAbsent ? 'Vắng' : 'Có lý do',
          note: excusedItem ? excusedItem.reason : '',
        });
      });

      // Sort timeline by date desc
      timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

      res.json({
        student,
        timeline,
        totalAbsences: attendanceRecords.filter((att) =>
          att.absentStudents.some((id) => id.toString() === student._id.toString()),
        ).length,
        totalCalls: callTasks.length,
      });
    } catch (error) {
      next(error);
    }
  },
);

// PUT /api/call-tasks/student-tags/:studentId (Update student tags directly)
router.put(
  '/student-tags/:studentId',
  verifyToken,
  requireSignedIn,
  requireStudentAccess,
  async (req, res, next) => {
    try {
      const { tags } = req.body;
      if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')) {
        return res.status(400).json({ message: 'Thẻ nhãn phải là một mảng' });
      }

      const SinhVien = require('../models/SinhVien');
      const student = await SinhVien.findByIdAndUpdate(
        req.params.studentId,
        { tags },
        { returnDocument: 'after' },
      );

      if (!student) {
        return res.status(404).json({ message: 'Không tìm thấy sinh viên' });
      }

      res.json({ message: 'Cập nhật thẻ nhãn thành công!', tags: student.tags });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
