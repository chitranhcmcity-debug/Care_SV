const NhomHocPhan = require('../models/NhomHocPhan');
const DiemDanh = require('../models/DiemDanh');
const SinhVien = require('../models/SinhVien');
const { assert, validateId } = require('../utils/kiemTra');
const { can } = require('../services/dichVuPhanQuyen');

/**
 * Whether a user may see (and call) a student:
 * - Roles granted 'students.view' (Trưởng phòng by default; admin read-only): every student.
 * - Giảng viên: students enrolled in a course group they teach.
 * - Nhân viên CSKH: only students of the administrative classes currently assigned to them.
 */
async function canAccessStudent(user, student) {
  if (can(user, 'students.view')) return true;
  if (user.role === 'teacher')
    return Boolean(await NhomHocPhan.exists({ teacherId: user.id, students: student._id }));
  if (user.role === 'staff')
    return (user.managedClasses || []).includes(
      String(student.classCode || '')
        .trim()
        .toUpperCase(),
    );
  return false;
}

/** Whether the user oversees attendance of every course group (read side). */
const seesAllCourses = (user) =>
  can(user, 'attendance.override') || can(user, 'reports.view') || can(user, 'students.view');
/**
 * Loads the course group (from :courseGroupId, body.courseGroupId or :attendanceId) and checks access.
 * mode 'read': the teacher of the group, or anyone who oversees attendance.
 * mode 'write': the teacher of the group (with attendance.take), or attendance.override.
 * The teacher's time window is enforced by the attendance routes.
 */
const courseAccess = (mode) => async (req, res, next) => {
  try {
    let courseId = req.params.courseGroupId || req.body?.courseGroupId;
    if (req.params.attendanceId) {
      validateId(req.params.attendanceId);
      const attendance = await DiemDanh.findById(req.params.attendanceId);
      assert(attendance, 'Không tìm thấy bản ghi điểm danh', 404);
      courseId = String(attendance.courseGroupId);
      req.attendance = attendance;
    }
    validateId(courseId);
    const group = await NhomHocPhan.findById(courseId);
    assert(group, 'Không tìm thấy học phần', 404);
    const isTeacher = String(group.teacherId) === req.user.id && can(req.user, 'attendance.take');
    const allowed =
      mode === 'read'
        ? isTeacher || seesAllCourses(req.user)
        : isTeacher || can(req.user, 'attendance.override');
    assert(allowed, 'Bạn không được phân công học phần này', 403);
    req.courseGroup = group;
    req.canOverrideAttendance = can(req.user, 'attendance.override');
    next();
  } catch (error) {
    next(error);
  }
};
const requireCourseRead = courseAccess('read');
const requireCourseWrite = courseAccess('write');
async function requireStudentAccess(req, res, next) {
  try {
    validateId(req.params.studentId);
    const student = await SinhVien.findById(req.params.studentId);
    assert(student, 'Không tìm thấy sinh viên', 404);
    assert(
      await canAccessStudent(req.user, student),
      'Bạn không được phân công sinh viên này',
      403,
    );
    req.student = student;
    next();
  } catch (error) {
    next(error);
  }
}
module.exports = {
  requireCourseRead,
  requireCourseWrite,
  requireStudentAccess,
  canAccessStudent,
  seesAllCourses,
};
