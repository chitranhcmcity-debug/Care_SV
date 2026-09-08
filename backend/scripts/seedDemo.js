const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Student = require('../models/Student');
const CourseGroup = require('../models/CourseGroup');
const Attendance = require('../models/Attendance');
const CallTask = require('../models/CallTask');
async function seedInitialUsers() {
  if (!process.env.DEMO_ADMIN_PASSWORD || !process.env.DEMO_STAFF_PASSWORD)
    throw new Error('Set DEMO_ADMIN_PASSWORD and DEMO_STAFF_PASSWORD before seeding');
  try {
    let adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      const adminPassword = await bcrypt.hash(process.env.DEMO_ADMIN_PASSWORD, 10);
      adminUser = await User.create({
        fullName: 'Quản trị viên Hệ thống',
        email: 'admin@itc.edu.vn',
        password: adminPassword,
        role: 'admin',
        status: 'active',
      });
    }

    let staff1User = await User.findOne({ email: 'staff1@itc.edu.vn' });
    if (!staff1User) {
      const staffPassword = await bcrypt.hash(process.env.DEMO_STAFF_PASSWORD, 10);
      staff1User = await User.create({
        fullName: 'Nhân viên Chăm sóc 1',
        email: 'staff1@itc.edu.vn',
        password: staffPassword,
        role: 'staff',
        status: 'active',
      });
    }

    let staff2User = await User.findOne({ email: 'staff2@itc.edu.vn' });
    if (!staff2User) {
      const staffPassword = await bcrypt.hash(process.env.DEMO_STAFF_PASSWORD, 10);
      staff2User = await User.create({
        fullName: 'Nhân viên Chăm sóc 2',
        email: 'staff2@itc.edu.vn',
        password: staffPassword,
        role: 'staff',
        status: 'active',
      });
    }

    // Seed Sample Students & Course Groups if empty
    const studentCount = await Student.countDocuments();
    if (studentCount === 0 && staff1User) {
      console.log('🌱 Đang khởi tạo danh sách sinh viên & nhóm học phần mẫu...');

      const st1 = await Student.create({
        studentCode: '501250001',
        fullName: 'Nguyễn Văn An',
        classCode: 'CD25CT1',
        dob: '15/04/2007',
        major: 'Công nghệ Thông tin',
        phone: '0901234567',
        parentPhone: '0987654321',
        courseGroups: ['501_MMT_HK1_26.27_CD25LM', '602_LTTT_HK1_26.27'],
      });

      const st2 = await Student.create({
        studentCode: '501250002',
        fullName: 'Trần Thị Bình',
        classCode: 'CD25CT1',
        dob: '22/08/2007',
        major: 'Công nghệ Thông tin',
        phone: '0912345678',
        parentPhone: '0976543210',
        courseGroups: ['501_MMT_HK1_26.27_CD25LM'],
      });

      const st3 = await Student.create({
        studentCode: '602250003',
        fullName: 'Lê Hoàng Cường',
        classCode: 'CL25TM1',
        dob: '10/12/2007',
        major: 'Thương mại Điện tử',
        phone: '0923456789',
        parentPhone: '0965432109',
        courseGroups: ['501_MMT_HK1_26.27_CD25LM'],
      });

      const cg1 = await CourseGroup.create({
        courseCode: 'NET101',
        groupCode: '501_MMT_HK1_26.27_CD25LM',
        courseName: 'Mạng Máy Tính Cơ Bản',
        shift: 'Sáng',
        scheduleDays: ['Thứ 2', 'Thứ 4', 'Thứ 6'],
        room: 'A.201',
        teacherName: 'ThS. Nguyễn Văn A',
        students: [st1._id, st2._id, st3._id],
      });

      const cg2 = await CourseGroup.create({
        courseCode: 'WEB202',
        groupCode: '602_LTTT_HK1_26.27',
        courseName: 'Lập Trình Web & Mobile',
        shift: 'Tối',
        scheduleDays: ['Thứ 3', 'Thứ 5', 'Thứ 7'],
        room: 'Lab 03',
        teacherName: 'ThS. Lê Hoàng Cường',
        students: [st1._id],
      });

      // Attendance history 1
      await Attendance.create({
        courseGroupId: cg1._id,
        date: new Date(Date.now() - 86400000 * 3),
        absentStudents: [st2._id, st3._id],
        recordedBy: adminUser._id,
      });

      // Attendance history 2 (st3 absent 2nd time -> triggering Exam Ban Risk!)
      await Attendance.create({
        courseGroupId: cg1._id,
        date: new Date(Date.now() - 86400000 * 1),
        absentStudents: [st3._id],
        recordedBy: adminUser._id,
      });

      // Seed Call Tasks assigned to staff1User
      await CallTask.create([
        {
          studentId: st3._id,
          courseGroupId: cg1._id,
          assignedStaffId: staff1User._id,
          absenceDate: new Date(Date.now() - 86400000 * 1),
          status: 'Chưa gọi',
          callNote: 'Sinh viên vắng 2 buổi liên tiếp, cần liên hệ gấp',
          callAttempts: 0,
        },
        {
          studentId: st2._id,
          courseGroupId: cg1._id,
          assignedStaffId: staff1User._id,
          absenceDate: new Date(Date.now() - 86400000 * 3),
          status: 'Không bắt máy',
          callNote: 'Đã gọi 1 lần nhưng không bắt máy, nghi do bận đi làm ca',
          callAttempts: 1,
        },
        {
          studentId: st1._id,
          courseGroupId: cg2._id,
          assignedStaffId: staff1User._id,
          absenceDate: new Date(Date.now() - 86400000 * 5),
          status: 'Đã liên hệ',
          callNote: 'Ốm sốt siêu vi có đơn thuốc xin nghỉ học',
          callAttempts: 1,
        },
      ]);

      console.log(
        '✅ Đã tạo dữ liệu mẫu: 3 sinh viên, 2 nhóm học phần, 2 buổi điểm danh & 3 nhiệm vụ gọi điện!',
      );
    }
  } catch (err) {
    console.error('Lỗi seed data:', err.message);
  }
}

module.exports = seedInitialUsers;
