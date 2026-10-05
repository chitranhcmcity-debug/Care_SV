const NhomHocPhan = require('../models/NhomHocPhan');
const SinhVien = require('../models/SinhVien');
const NguoiDung = require('../models/NguoiDung');
const DiemDanh = require('../models/DiemDanh');
const { SHIFT, DEFAULT_SCHEDULE_DAYS } = require('../utils/hangSo');
const { assert, validateId, normalizeClass } = require('../utils/kiemTra');
const { classHours } = require('../services/dichVuCanhBao');

const STUDENT_FIELDS = 'studentCode fullName classCode major phone parentPhone';
const TEACHER_FIELDS = 'fullName email role status';

/** The teacher account behind `teacherId`; only an active teacher can be put in charge. */
async function findTeacher(teacherId) {
  validateId(teacherId);
  const teacher = await NguoiDung.findById(teacherId);
  assert(
    teacher && teacher.role === 'teacher' && teacher.status === 'active',
    'Chỉ phân công giảng viên đang hoạt động cho học phần',
  );
  return teacher;
}

const TIMETABLE_FIELDS = ['startTime', 'endTime', 'periodsPerSession', 'totalPeriods'];

/** Class hours and periods from the request body; the class must end after it starts. */
function applyTimetable(group, body) {
  for (const field of TIMETABLE_FIELDS) {
    if (body[field] === undefined) continue;
    group[field] = field.endsWith('Time') ? String(body[field] || '') : Number(body[field]) || 0;
  }
  const { startTime, endTime } = classHours(group);
  assert(startTime < endTime, 'Giờ tan học phải sau giờ vào học');
}

async function getTimetable(req, res, next) {
  try {
    const groups = await NhomHocPhan.aggregate([
      {
        $project: {
          groupCode: 1,
          courseCode: 1,
          courseName: 1,
          shift: 1,
          scheduleDays: 1,
          room: 1,
          startTime: 1,
          endTime: 1,
          periodsPerSession: 1,
          totalPeriods: 1,
          startDate: 1,
          endDate: 1,
          teacherId: 1,
          teacherName: 1,
          studentCount: { $size: { $ifNull: ['$students', []] } },
        },
      },
      { $sort: { groupCode: 1 } },
    ]);
    res.json(groups.map((g) => ({ ...g, isMine: String(g.teacherId) === req.user.id })));
  } catch (error) {
    next(error);
  }
}

async function list(req, res, next) {
  try {
    const { shift, search } = req.query;
    const filter = {};
    if (shift) filter.shift = shift;

    let groups = await NhomHocPhan.find(filter)
      .populate('students', STUDENT_FIELDS)
      .populate('teacherId', TEACHER_FIELDS)
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
}

async function create(req, res, next) {
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

    if (typeof groupCode !== 'string' || !groupCode.trim()) {
      return res.status(400).json({ message: 'Mã Nhóm Học Phần là bắt buộc' });
    }

    const existing = await NhomHocPhan.findOne({ groupCode: groupCode.trim() });
    if (existing) {
      return res.status(400).json({ message: 'Mã nhóm học phần này đã tồn tại trong hệ thống' });
    }

    let assignedTeacherName = teacherName || 'Giảng viên CNTT';
    let validTeacherId = null;

    if (teacherId) {
      const teacher = await findTeacher(teacherId);
      validTeacherId = teacher._id;
      assignedTeacherName = teacher.fullName;
    }

    const draft = new NhomHocPhan({ groupCode: groupCode.trim(), shift: shift || SHIFT.MORNING });
    applyTimetable(draft, req.body);
    const newGroup = await NhomHocPhan.create({
      ...Object.fromEntries(TIMETABLE_FIELDS.map((f) => [f, draft[f]])),
      courseCode: courseCode || '',
      courseName: courseName || groupCode,
      groupCode: groupCode.trim(),
      shift: shift || SHIFT.MORNING,
      scheduleDays:
        Array.isArray(scheduleDays) && scheduleDays.length
          ? scheduleDays
          : [...DEFAULT_SCHEDULE_DAYS],
      room: room || 'A.101',
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      teacherId: validTeacherId,
      teacherName: assignedTeacherName,
      students: [],
    });

    const populatedGroup = await NhomHocPhan.findById(newGroup._id)
      .populate('students', STUDENT_FIELDS)
      .populate('teacherId', TEACHER_FIELDS);

    res.status(201).json({
      message: 'Tạo nhóm học phần mới thành công!',
      group: populatedGroup,
    });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
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

    const group = await NhomHocPhan.findById(req.params.id);
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
    applyTimetable(group, req.body);

    if (teacherId !== undefined) {
      // Re-saving with the current teacher is fine even if that account was locked since.
      if (teacherId && String(teacherId) !== String(group.teacherId)) {
        const teacher = await findTeacher(teacherId);
        group.teacherId = teacher._id;
        group.teacherName = teacher.fullName;
      } else if (!teacherId) {
        group.teacherId = null;
      }
    } else if (teacherName !== undefined) {
      group.teacherName = teacherName;
    }

    await group.save();

    const updated = await NhomHocPhan.findById(group._id)
      .populate('students', STUDENT_FIELDS)
      .populate('teacherId', TEACHER_FIELDS);

    res.json({ message: 'Cập nhật thông tin học phần thành công!', group: updated });
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const deleted = await NhomHocPhan.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Không tìm thấy nhóm học phần' });
    }

    // Every route that reads DiemDanh for a group first loads the group
    // (requireCourseAccess), so once it's gone those records become permanently
    // unreachable orphans. Remove them, and drop the group from its students' list.
    await Promise.all([
      DiemDanh.deleteMany({ courseGroupId: deleted._id }),
      deleted.students?.length &&
        SinhVien.updateMany(
          { _id: { $in: deleted.students } },
          { $pull: { courseGroups: deleted.groupCode } },
        ),
    ]);

    res.json({ message: 'Đã xóa nhóm học phần thành công!' });
  } catch (error) {
    next(error);
  }
}

async function assignStudent(req, res, next) {
  try {
    const { studentCode, studentId } = req.body;

    const group = await NhomHocPhan.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Không tìm thấy nhóm học phần' });
    }

    let student;
    if (studentId) {
      student = await SinhVien.findById(studentId);
    } else if (studentCode) {
      student = await SinhVien.findOne({ studentCode: studentCode.trim() });
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

    const updatedGroup = await NhomHocPhan.findById(group._id).populate(
      'students',
      STUDENT_FIELDS,
    );

    res.json({
      message: `Đã đăng ký thành công SV ${student.fullName} (${student.studentCode}) vào học phần!`,
      group: updatedGroup,
    });
  } catch (error) {
    next(error);
  }
}

async function removeStudent(req, res, next) {
  try {
    const group = await NhomHocPhan.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Không tìm thấy nhóm học phần' });
    }

    const studentId = req.params.studentId;
    group.students = group.students.filter((st) => st.toString() !== studentId);
    await group.save();

    // Remove groupCode from SinhVien's courseGroups array
    const student = await SinhVien.findById(studentId);
    if (student) {
      student.courseGroups = student.courseGroups.filter((g) => g !== group.groupCode);
      await student.save();
    }

    const updatedGroup = await NhomHocPhan.findById(group._id).populate(
      'students',
      STUDENT_FIELDS,
    );

    res.json({ message: 'Đã rút tên sinh viên khỏi học phần!', group: updatedGroup });
  } catch (error) {
    next(error);
  }
}

async function assignClass(req, res, next) {
  try {
    const { classCode } = req.body;
    if (typeof classCode !== 'string' || !classCode.trim()) {
      return res.status(400).json({ message: 'Mã lớp sinh hoạt là bắt buộc' });
    }

    const group = await NhomHocPhan.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Không tìm thấy nhóm học phần' });
    }

    const classStudents = await SinhVien.find({ classCode: normalizeClass(classCode) });
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

    const updatedGroup = await NhomHocPhan.findById(group._id).populate(
      'students',
      STUDENT_FIELDS,
    );

    res.json({
      message: `Đã đăng ký thành công toàn bộ ${addedCount} sinh viên của lớp ${classCode} vào học phần!`,
      group: updatedGroup,
      addedCount,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getTimetable,
  list,
  create,
  update,
  remove,
  assignStudent,
  removeStudent,
  assignClass,
};
