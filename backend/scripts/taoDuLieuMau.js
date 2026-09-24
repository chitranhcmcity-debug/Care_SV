const bcrypt = require('bcryptjs');
const NguoiDung = require('../models/NguoiDung');
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const DiemDanh = require('../models/DiemDanh');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const { CALL_STATUS, SHIFT } = require('../utils/hangSo');
async function seedInitialUsers() {
  if (!process.env.DEMO_ADMIN_PASSWORD || !process.env.DEMO_STAFF_PASSWORD)
    throw new Error('Set DEMO_ADMIN_PASSWORD and DEMO_STAFF_PASSWORD before seeding');
  try {
    let adminUser = await NguoiDung.findOne({ role: 'admin' });
    if (!adminUser) {
      const adminPassword = await bcrypt.hash(process.env.DEMO_ADMIN_PASSWORD, 10);
      adminUser = await NguoiDung.create({
        fullName: 'Quản trị viên Hệ thống',
        email: 'admin@itc.edu.vn',
        password: adminPassword,
        role: 'admin',
        status: 'active',
      });
    }

    let staff1User = await NguoiDung.findOne({ email: 'staff1@itc.edu.vn' });
    if (!staff1User) {
      const staffPassword = await bcrypt.hash(process.env.DEMO_STAFF_PASSWORD, 10);
      staff1User = await NguoiDung.create({
        fullName: 'Nhân viên Chăm sóc 1',
        email: 'staff1@itc.edu.vn',
        password: staffPassword,
        role: 'staff',
        status: 'active',
      });
    }

    let staff2User = await NguoiDung.findOne({ email: 'staff2@itc.edu.vn' });
    if (!staff2User) {
      const staffPassword = await bcrypt.hash(process.env.DEMO_STAFF_PASSWORD, 10);
      staff2User = await NguoiDung.create({
        fullName: 'Nhân viên Chăm sóc 2',
        email: 'staff2@itc.edu.vn',
        password: staffPassword,
        role: 'staff',
        status: 'active',
      });
    }

    // Seed Sample Students & Course Groups if empty
    const studentCount = await SinhVien.countDocuments();
    if (studentCount === 0 && staff1User) {
      console.log('🌱 Đang khởi tạo danh sách sinh viên & nhóm học phần mẫu...');

      const st1 = await SinhVien.create({
        studentCode: '501250001',
        fullName: 'Nguyễn Văn An',
        classCode: 'CD25CT1',
        dob: '15/04/2007',
        major: 'Công nghệ Thông tin',
        phone: '0901234567',
        parentPhone: '0987654321',
        courseGroups: ['501_MMT_HK1_26.27_CD25LM', '602_LTTT_HK1_26.27'],
      });

      const st2 = await SinhVien.create({
        studentCode: '501250002',
        fullName: 'Trần Thị Bình',
        classCode: 'CD25CT1',
        dob: '22/08/2007',
        major: 'Công nghệ Thông tin',
        phone: '0912345678',
        parentPhone: '0976543210',
        courseGroups: ['501_MMT_HK1_26.27_CD25LM'],
      });

      const st3 = await SinhVien.create({
        studentCode: '602250003',
        fullName: 'Lê Hoàng Cường',
        classCode: 'CL25TM1',
        dob: '10/12/2007',
        major: 'Thương mại Điện tử',
        phone: '0923456789',
        parentPhone: '0965432109',
        courseGroups: ['501_MMT_HK1_26.27_CD25LM'],
      });

      const cg1 = await NhomHocPhan.create({
        courseCode: 'NET101',
        groupCode: '501_MMT_HK1_26.27_CD25LM',
        courseName: 'Mạng Máy Tính Cơ Bản',
        shift: SHIFT.MORNING,
        scheduleDays: ['thu_2', 'thu_4', 'thu_6'],
        room: 'A.201',
        teacherName: 'ThS. Nguyễn Văn A',
        students: [st1._id, st2._id, st3._id],
      });

      const cg2 = await NhomHocPhan.create({
        courseCode: 'WEB202',
        groupCode: '602_LTTT_HK1_26.27',
        courseName: 'Lập Trình Web & Mobile',
        shift: SHIFT.EVENING,
        scheduleDays: ['thu_3', 'thu_5', 'thu_7'],
        room: 'Lab 03',
        teacherName: 'ThS. Lê Hoàng Cường',
        students: [st1._id],
      });

      // DiemDanh history 1
      await DiemDanh.create({
        courseGroupId: cg1._id,
        date: new Date(Date.now() - 86400000 * 3),
        absentStudents: [st2._id, st3._id],
        recordedBy: adminUser._id,
      });

      // DiemDanh history 2 (st3 absent 2nd time -> triggering Exam Ban Risk!)
      await DiemDanh.create({
        courseGroupId: cg1._id,
        date: new Date(Date.now() - 86400000 * 1),
        absentStudents: [st3._id],
        recordedBy: adminUser._id,
      });

      // Seed Call Tasks assigned to staff1User
      await NhiemVuGoiDien.create([
        {
          studentId: st3._id,
          courseGroupId: cg1._id,
          assignedStaffId: staff1User._id,
          absenceDate: new Date(Date.now() - 86400000 * 1),
          status: CALL_STATUS.PENDING,
          callNote: 'Sinh viên vắng 2 buổi liên tiếp, cần liên hệ gấp',
          callAttempts: 0,
        },
        {
          studentId: st2._id,
          courseGroupId: cg1._id,
          assignedStaffId: staff1User._id,
          absenceDate: new Date(Date.now() - 86400000 * 3),
          status: CALL_STATUS.UNREACHABLE,
          callNote: 'Đã gọi 1 lần nhưng không bắt máy, nghi do bận đi làm ca',
          callAttempts: 1,
        },
        {
          studentId: st1._id,
          courseGroupId: cg2._id,
          assignedStaffId: staff1User._id,
          absenceDate: new Date(Date.now() - 86400000 * 5),
          status: CALL_STATUS.CONTACTED,
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
