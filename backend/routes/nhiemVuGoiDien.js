const { CALL_STATUS, toLabel } = require('../utils/hangSo');
const { updateCallTask } = require('../services/dichVuNhiemVuGoiDien');
const { requireStudentAccess } = require('../middleware/phanQuyen');
const { assert, validateId, dateKey } = require('../utils/kiemTra');
const express = require('express');
const router = express.Router();
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const NguoiDung = require('../models/NguoiDung');
const SinhVien = require('../models/SinhVien');
const DiemDanh = require('../models/DiemDanh');
const {
  verifyToken,
  requireSignedIn,
  requireOperator,
  requireAdmin,
  requirePermission,
} = require('../middleware/xacThuc');

// POST /api/call-tasks/cleanup-duplicates (Admin xóa task trùng)
// Keeps one task per student / course group / absence day — the one with the most call work
// (then the oldest) — and only deletes copies nobody has called yet, so no care history is lost.
router.post('/cleanup-duplicates', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const all = await NhiemVuGoiDien.find()
      .sort({ callAttempts: -1, createdAt: 1 })
      .select('studentId courseGroupId absenceDate callAttempts status')
      .lean();
    const seen = new Set();
    const toDelete = [];
    for (const t of all) {
      const key = `${t.studentId}_${t.courseGroupId}_${dateKey(t.absenceDate)}`;
      const untouched = !t.callAttempts && t.status === CALL_STATUS.PENDING;
      if (seen.has(key) && untouched) toDelete.push(t._id);
      seen.add(key);
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
router.get(
  '/admin-all',
  verifyToken,
  requirePermission('callTasks.viewAll'),
  async (req, res, next) => {
    try {
      const { status, groupCode, classCode, assignedTo } = req.query;
      const filter = {};
      if (status) filter.status = status;
      // assignedTo=unassigned → the manager's queue (classes without a responsible staff member).
      if (assignedTo === 'unassigned') filter.assignedStaffId = null;
      else if (assignedTo) {
        validateId(assignedTo);
        filter.assignedStaffId = assignedTo;
      }
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
  },
);

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
router.put(
  '/:id/update',
  verifyToken,
  requirePermission('callTasks.update'),
  async (req, res, next) => {
    try {
      const taskId = req.params.id;
      validateId(taskId);
      const task = await NhiemVuGoiDien.findById(taskId);
      if (!task) {
        return res.status(404).json({ message: 'Không tìm thấy nhiệm vụ cuộc gọi' });
      }
      assert(String(task.assignedStaffId) === req.user.id, 'Nhiệm vụ không thuộc về bạn', 403);
      await updateCallTask(task, req.body ?? {});

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
  },
);

// PUT /api/call-tasks/:id/assign (Trưởng phòng) — body { staffId }: hand one call task (e.g. from
// the unassigned queue) to an active staff member.
router.put(
  '/:id/assign',
  verifyToken,
  requirePermission('classes.assign'),
  async (req, res, next) => {
    try {
      validateId(req.params.id);
      validateId(req.body?.staffId);
      const staff = await NguoiDung.findById(req.body.staffId);
      assert(
        staff && staff.role === 'staff' && staff.status === 'active',
        'Chỉ giao cho nhân viên CSKH đang hoạt động',
      );
      const task = await NhiemVuGoiDien.findByIdAndUpdate(
        req.params.id,
        { assignedStaffId: staff._id },
        { returnDocument: 'after' },
      );
      assert(task, 'Không tìm thấy nhiệm vụ cuộc gọi', 404);
      res.json({ message: `Đã giao cuộc gọi cho ${staff.fullName}`, task });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/call-tasks/student-360/:studentId (Education CRM - Profile 360 Timeline)
router.get(
  '/student-360/:studentId',
  verifyToken,
  requireSignedIn,
  requireStudentAccess,
  async (req, res, next) => {
    try {
      const { student } = req; // loaded and access-checked by requireStudentAccess

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
  requireOperator,
  requireStudentAccess,
  async (req, res, next) => {
    try {
      const { tags } = req.body;
      if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')) {
        return res.status(400).json({ message: 'Thẻ nhãn phải là một mảng' });
      }

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
