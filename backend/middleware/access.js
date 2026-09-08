const CourseGroup = require('../models/CourseGroup');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const CallTask = require('../models/CallTask');
const { assert, validateId } = require('../utils/validation');
async function requireCourseAccess(req, res, next) {
  try {
    let courseId = req.params.courseGroupId || req.body?.courseGroupId;
    if (req.params.attendanceId) {
      validateId(req.params.attendanceId);
      const attendance = await Attendance.findById(req.params.attendanceId);
      assert(attendance, 'Không tìm thấy bản ghi điểm danh', 404);
      courseId = String(attendance.courseGroupId);
      req.attendance = attendance;
    }
    validateId(courseId);
    const group = await CourseGroup.findById(courseId);
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
    const student = await Student.findById(req.params.studentId);
    assert(student, 'Không tìm thấy sinh viên', 404);
    if (req.user.role !== 'admin') {
      const hasTask = await CallTask.exists({
        studentId: student._id,
        assignedStaffId: req.user.id,
      });
      const assigned =
        req.user.managedStudents?.some((id) => String(id) === String(student._id)) ||
        req.user.managedClasses?.includes(student.classCode);
      assert(
        req.user.role === 'staff' && (hasTask || assigned),
        'Bạn không được phân công sinh viên này',
        403,
      );
    }
    req.student = student;
    next();
  } catch (error) {
    next(error);
  }
}
module.exports = { requireCourseAccess, requireStudentAccess };
