const NhomHocPhan = require('../models/NhomHocPhan');
const DiemDanh = require('../models/DiemDanh');
const SinhVien = require('../models/SinhVien');
const HoSoChamSoc = require('../models/HoSoChamSoc');
const { OPEN_CARE_STATUSES } = require('../utils/hangSo');
const { assert, validateId, normalizeClass } = require('../utils/kiemTra');
const { can } = require('../services/dichVuPhanQuyen');

/**
 * Người dùng có được xem (và gọi) một sinh viên không:
 * - Vai trò được cấp 'students.view' (mặc định là Trưởng phòng; admin chỉ đọc): mọi sinh viên.
 * - Giảng viên: sinh viên đăng ký trong học phần họ dạy.
 * - Nhân viên CSSV: sinh viên của các lớp sinh hoạt hiện được giao cho họ, và mọi
 *   sinh viên có hồ sơ chăm sóc đang mở mà họ được chỉ đạo.
 */
async function canAccessStudent(user, student) {
  if (can(user, 'students.view')) return true;
  if (user.role === 'teacher')
    return Boolean(await NhomHocPhan.exists({ teacherId: user.id, students: student._id }));
  if (user.role === 'staff')
    return (
      (user.managedClasses || []).includes(normalizeClass(student.classCode)) ||
      Boolean(
        await HoSoChamSoc.exists({
          studentId: student._id,
          assignedStaffId: user.id,
          status: { $in: [...OPEN_CARE_STATUSES] },
        }),
      )
    );
  return false;
}

/** Người dùng có giám sát điểm danh của mọi học phần không (phía đọc). */
const seesAllCourses = (user) =>
  can(user, 'attendance.view') || can(user, 'reports.view') || can(user, 'students.view');
/**
 * Nạp học phần (từ :courseGroupId, body.courseGroupId hoặc :attendanceId) và kiểm tra quyền truy cập.
 * chế độ 'read': giảng viên của học phần, hoặc người có quyền giám sát điểm danh.
 * chế độ 'write': chỉ giảng viên của học phần (có attendance.take); bên giám sát chỉ xem.
 * Khung giờ của giảng viên được các route điểm danh kiểm soát.
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
    const allowed = mode === 'read' ? isTeacher || seesAllCourses(req.user) : isTeacher;
    assert(allowed, 'Bạn không được phân công học phần này', 403);
    req.courseGroup = group;
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
