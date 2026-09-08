const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const CourseGroup = require('../models/CourseGroup');
const Student = require('../models/Student');
const User = require('../models/User');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// GET /api/course-groups (List all course groups with student & teacher details)
router.get('/', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { shift, search } = req.query;
    const filter = {};
    if (shift) filter.shift = shift;

    let groups = await CourseGroup.find(filter)
      .populate('students', 'studentCode fullName classCode major phone parentPhone')
      .populate('teacherId', 'fullName email role status')
      .sort({ createdAt: -1 });

    if (search) {
      const term = String(search).toLowerCase();
      groups = groups.filter(
        (g) =>
          g.groupCode.toLowerCase().includes(term) ||
          g.courseName.toLowerCase().includes(term) ||
          g.courseCode.toLowerCase().includes(term),
      );
    }

    res.json(groups);
  } catch (error) {
    next(error);
  }
});

// POST /api/course-groups (Create new Course Group with schedule & teacher)
router.post('/', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const {
      courseCode,
      courseName,
      groupCode,
      shift,
      scheduleDays,
      room,
      startDate,
      endDate,
      teacherId,
      teacherName,
    } = req.body;

    if (!groupCode) {
      return res.status(400).json({ message: 'Mã Nhóm Học Phần là bắt buộc' });
    }

    const existing = await CourseGroup.findOne({ groupCode: groupCode.trim() });
    if (existing) {
      return res.status(400).json({ message: 'Mã nhóm học phần này đã tồn tại trong hệ thống' });
    }

    let assignedTeacherName = teacherName || 'Giảng viên CNTT';
    let validTeacherId = null;

    if (teacherId && mongoose.Types.ObjectId.isValid(teacherId)) {
      validTeacherId = teacherId;
      const teacherUser = await User.findById(teacherId);
      if (teacherUser) {
        assignedTeacherName = teacherUser.fullName;
      }
    }

    const newGroup = await CourseGroup.create({
      courseCode: courseCode || '',
      courseName: courseName || groupCode,
      groupCode: groupCode.trim(),
      shift: shift || 'Sáng',
      scheduleDays:
        Array.isArray(scheduleDays) && scheduleDays.length
          ? scheduleDays
          : ['Thứ 2', 'Thứ 4', 'Thứ 6'],
      room: room || 'A.101',
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      teacherId: validTeacherId,
      teacherName: assignedTeacherName,
      students: [],
    });

    const populatedGroup = await CourseGroup.findById(newGroup._id)
      .populate('students', 'studentCode fullName classCode major phone parentPhone')
      .populate('teacherId', 'fullName email role status');

    res.status(201).json({
      message: 'Tạo nhóm học phần mới thành công!',
      group: populatedGroup,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/course-groups/:id (Update Course Group schedule & info)
router.put('/:id', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const {
      courseCode,
      courseName,
      shift,
      scheduleDays,
      room,
      startDate,
      endDate,
      teacherId,
      teacherName,
    } = req.body;

    const group = await CourseGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Không tìm thấy nhóm học phần' });
    }

    if (courseCode !== undefined) group.courseCode = courseCode;
    if (courseName !== undefined) group.courseName = courseName;
    if (shift !== undefined) group.shift = shift;
    if (Array.isArray(scheduleDays)) group.scheduleDays = scheduleDays;
    if (room !== undefined) group.room = room;
    if (startDate !== undefined) group.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) group.endDate = endDate ? new Date(endDate) : null;

    if (teacherId !== undefined) {
      if (teacherId && mongoose.Types.ObjectId.isValid(teacherId)) {
        group.teacherId = teacherId;
        const teacherUser = await User.findById(teacherId);
        if (teacherUser) group.teacherName = teacherUser.fullName;
      } else {
        group.teacherId = null;
      }
    } else if (teacherName !== undefined) {
      group.teacherName = teacherName;
    }

    await group.save();

    const updated = await CourseGroup.findById(group._id)
      .populate('students', 'studentCode fullName classCode major phone parentPhone')
      .populate('teacherId', 'fullName email role status');

    res.json({ message: 'Cập nhật thông tin học phần thành công!', group: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/course-groups/:id (Delete Course Group)
router.delete('/:id', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const deleted = await CourseGroup.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Không tìm thấy nhóm học phần' });
    }
    res.json({ message: 'Đã xóa nhóm học phần thành công!' });
  } catch (error) {
    next(error);
  }
});

// POST /api/course-groups/:id/assign-student (Enroll individual student by MSSV or ID)
router.post('/:id/assign-student', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { studentCode, studentId } = req.body;

    const group = await CourseGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Không tìm thấy nhóm học phần' });
    }

    let student;
    if (studentId) {
      student = await Student.findById(studentId);
    } else if (studentCode) {
      student = await Student.findOne({ studentCode: studentCode.trim() });
    }

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy sinh viên với MSSV này' });
    }

    // Add to group.students if not present
    if (!group.students.includes(student._id)) {
      group.students.push(student._id);
      await group.save();
    }

    // Add groupCode to student.courseGroups if not present
    if (!student.courseGroups.includes(group.groupCode)) {
      student.courseGroups.push(group.groupCode);
      await student.save();
    }

    const updatedGroup = await CourseGroup.findById(group._id).populate(
      'students',
      'studentCode fullName classCode major phone parentPhone',
    );

    res.json({
      message: `Đã đăng ký thành công SV ${student.fullName} (${student.studentCode}) vào học phần!`,
      group: updatedGroup,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/course-groups/:id/remove-student/:studentId (Unenroll student)
router.delete(
  '/:id/remove-student/:studentId',
  verifyToken,
  requireAdmin,
  async (req, res, next) => {
    try {
      const group = await CourseGroup.findById(req.params.id);
      if (!group) {
        return res.status(404).json({ message: 'Không tìm thấy nhóm học phần' });
      }

      const studentId = req.params.studentId;
      group.students = group.students.filter((st) => st.toString() !== studentId);
      await group.save();

      // Remove groupCode from Student's courseGroups array
      const student = await Student.findById(studentId);
      if (student) {
        student.courseGroups = student.courseGroups.filter((g) => g !== group.groupCode);
        await student.save();
      }

      const updatedGroup = await CourseGroup.findById(group._id).populate(
        'students',
        'studentCode fullName classCode major phone parentPhone',
      );

      res.json({ message: 'Đã rút tên sinh viên khỏi học phần!', group: updatedGroup });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/course-groups/:id/assign-class (Enroll all students of an entire Class into this Course Group)
router.post('/:id/assign-class', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { classCode } = req.body;
    if (!classCode) {
      return res.status(400).json({ message: 'Mã lớp sinh hoạt là bắt buộc' });
    }

    const group = await CourseGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Không tìm thấy nhóm học phần' });
    }

    const classStudents = await Student.find({ classCode: classCode.trim() });
    if (classStudents.length === 0) {
      return res
        .status(404)
        .json({ message: `Không tìm thấy sinh viên nào thuộc lớp ${classCode}` });
    }

    let addedCount = 0;
    for (const st of classStudents) {
      if (!group.students.includes(st._id)) {
        group.students.push(st._id);
        addedCount++;
      }

      if (!st.courseGroups.includes(group.groupCode)) {
        st.courseGroups.push(group.groupCode);
        await st.save();
      }
    }

    await group.save();

    const updatedGroup = await CourseGroup.findById(group._id).populate(
      'students',
      'studentCode fullName classCode major phone parentPhone',
    );

    res.json({
      message: `Đã đăng ký thành công toàn bộ ${addedCount} sinh viên của lớp ${classCode} vào học phần!`,
      group: updatedGroup,
      addedCount,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
