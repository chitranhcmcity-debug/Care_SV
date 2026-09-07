const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const Student = require('./models/Student');
const CourseGroup = require('./models/CourseGroup');
const Attendance = require('./models/Attendance');
const CallTask = require('./models/CallTask');

const SystemSettings = require('./models/SystemSettings');

const authRoutes = require('./routes/auth');
const crawlerRoutes = require('./routes/crawler');
const excelRoutes = require('./routes/excel');
const attendanceRoutes = require('./routes/attendance');
const callTaskRoutes = require('./routes/callTask');
const analyticsRoutes = require('./routes/analytics');
const settingsRoutes = require('./routes/settings');
const courseGroupRoutes = require('./routes/courseGroup');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Route Registration
app.use('/api/auth', authRoutes);
app.use('/api/crawler', crawlerRoutes);
app.use('/api/excel', excelRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/call-tasks', callTaskRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/course-groups', courseGroupRoutes);

const fs = require('fs');
const path = require('path');
const frontendDist = path.join(__dirname, '../frontend/dist/frontend/browser');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('🚀 Hệ thống API Chăm sóc & Điểm danh Sinh viên ITC đang hoạt động!');
  });
}

// Seed Initial Admin, Staff users, Students, CourseGroups & CallTasks
async function seedInitialUsers() {
  try {
    let adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      const adminPassword = await bcrypt.hash('admin123', 10);
      adminUser = await User.create({
        fullName: 'Quản trị viên Hệ thống',
        email: 'admin@itc.edu.vn',
        password: adminPassword,
        role: 'admin',
        status: 'active',
      });
      console.log('✅ Đã tạo tài khoản Admin (admin@itc.edu.vn / admin123)');
    }

    let staff1User = await User.findOne({ email: 'staff1@itc.edu.vn' });
    if (!staff1User) {
      const staffPassword = await bcrypt.hash('staff123', 10);
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
      const staffPassword = await bcrypt.hash('staff123', 10);
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

      console.log('✅ Đã tạo dữ liệu mẫu: 3 sinh viên, 2 nhóm học phần, 2 buổi điểm danh & 3 nhiệm vụ gọi điện!');
    }
  } catch (err) {
    console.error('Lỗi seed data:', err.message);
  }
}

const PORT = process.env.PORT || 5000;

async function startServer() {
  let connected = false;

  // 1. Try Atlas MongoDB URI
  try {
    console.log('🔄 Đang thử kết nối MongoDB Atlas...');
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    console.log('✅ Đã kết nối MongoDB Atlas thành công!');
    connected = true;
  } catch (atlasErr) {
    console.warn('⚠️ MongoDB Atlas timeout/IP Whitelist restriction:', atlasErr.message);
  }

  // 2. Try Local MongoDB (127.0.0.1:27017)
  if (!connected) {
    try {
      console.log('🔄 Đang thử kết nối MongoDB Local...');
      await mongoose.connect('mongodb://127.0.0.1:27017/itc_care', { serverSelectionTimeoutMS: 1500 });
      console.log('✅ Đã kết nối MongoDB Local thành công!');
      connected = true;
    } catch (localErr) {
      console.warn('⚠️ MongoDB Local không khả dụng.');
    }
  }

  // 3. Local MongoMemoryServer
  if (!connected) {
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      console.log('⚡ Đang khởi tạo CSDL MongoDB Memory Server...');
      const mongod = await MongoMemoryServer.create({ binary: { skipMD5: true } });
      await mongoose.connect(mongod.getUri());
      console.log('✅ Đã kết nối CSDL MongoDB Memory Server thành công!');
      connected = true;
    } catch (memErr) {
      console.error('❌ Lỗi kết nối MongoDB Memory Server:', memErr.message);
    }
  }

  if (mongoose.connection.readyState === 1) {
    await seedInitialUsers();
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Backend Server đang chạy tại http://0.0.0.0:${PORT} (Port ${PORT})`);
  });
}

startServer();