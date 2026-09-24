const NhomHocPhan = require('../models/NhomHocPhan');
const DiemDanh = require('../models/DiemDanh');
const SinhVien = require('../models/SinhVien');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const { assert, validateId } = require('../utils/kiemTra');
const { isManagement } = require('../utils/hangSo');

/**
 * Whether a user may see (and call) a student:
 * - Admin, Trưởng phòng/Phó hiệu trưởng: every student.
 * - Giảng viên: students enrolled in a course group they teach.
 * - Nhân viên CSKH: students they have a call task for, or who are assigned to them.
 */
async function canAccessStudent(user, student) {
  if (isManagement(user)) return true;
  if (user.role === 'teacher')
    return Boolean(await NhomHocPhan.exists({ teacherId: user.id, students: student._id }));
  if (user.role === 'staff') {
    if (
      user.managedStudents?.some((id) => String(id) === String(student._id)) ||
      user.managedClasses?.includes(student.classCode)
    )
      return true;
    return Boolean(
      await NhiemVuGoiDien.exists({ studentId: student._id, assignedStaffId: user.id }),
    );
  }
  return false;
}
async function requireCourseAccess(req, res, next) {
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
    assert(
      req.user.role === 'admin' || String(group.teacherId) === req.user.id,
      'Bạn không được phân công học phần này',
      403,
    );
    req.courseGroup = group;
    next();
  } catch (error) {
    next(error);
  }
}
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
module.exports = { requireCourseAccess, requireStudentAccess, canAccessStudent };
