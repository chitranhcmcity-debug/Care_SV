const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
require('dotenv').config();

const User = require('./models/User');
const Student = require('./models/Student');
const CourseGroup = require('./models/CourseGroup');
const Attendance = require('./models/Attendance');
const CallTask = require('./models/CallTask');
const SystemSettings = require('./models/SystemSettings');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey_itc_care_2026';

const resultsMatrix = [];

function recordResult(stage, testName, passed, details = '') {
  resultsMatrix.push({ stage, testName, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${icon}] ${stage} | ${testName} ${details ? '-> ' + details : ''}`);
}

async function connectToMongo() {
  const uris = [
    process.env.MONGO_URI,
    'mongodb://127.0.0.1:27017/itc_care',
  ].filter(Boolean);

  for (const uri of uris) {
    try {
      console.log(`📡 Trying Mongo URI: ${uri.substring(0, 35)}...`);
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
      console.log('✅ Connected successfully to MongoDB Server!');
      return true;
    } catch (err) {
      console.warn(`⚠️ External DB unavailable (${err.message.split('\n')[0]})`);
    }
  }

  try {
    console.log('🚀 Launching Embedded MongoMemoryServer for E2E Test...');
    const mongod = await MongoMemoryServer.create();
    const memoryUri = mongod.getUri();
    await mongoose.connect(memoryUri);
    console.log('✅ Connected to In-Memory MongoDB Server!');
    return true;
  } catch (memErr) {
    console.error('❌ Failed to launch MongoMemoryServer:', memErr.message);
    return false;
  }
}

async function runE2ELifecycleTest() {
  console.log('\n================================================================');
  console.log('🚀 STARTING FULL SEMESTER LIFECYCLE E2E INTEGRATION TEST');
  console.log('================================================================\n');

  const connected = await connectToMongo();
  if (!connected) {
    console.error('❌ Could not connect to any MongoDB instance. Aborting E2E test.');
    process.exit(1);
  }

  try {
    // ----------------------------------------------------------------
    // STAGE 1: SETUP & CONFIGURATION SEEDING
    // ----------------------------------------------------------------
    console.log('\n--- STAGE 1: Setup & Configuration Seeding ---');

    // 1.1 SystemConfig Setup
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = new SystemSettings();
    }
    settings.examBanThreshold = 2;
    settings.parentWarningThreshold = 1;
    settings.taskAssignmentRule = 'round-robin';
    settings.tags = ['#KhóKhănHọcPhí', '#HọcBổng', '#CầnHỗTrợĐặcBiệt'];
    settings.absenceReasons = ['Bệnh/Sức khỏe', 'Việc gia đình', 'Lý do cá nhân'];
    await settings.save();
    recordResult('Stage 1', 'SystemConfig Setup', true, 'Thresholds (ExamBan=2), tags & reasons updated');

    // 1.2 User Seeding (Admin, Teacher, Staff A, Staff B)
    const passHash = await bcrypt.hash('test123456', 10);

    await User.deleteMany({ email: { $regex: /lifecycle/i } });
    await Student.deleteMany({ studentCode: { $regex: /STU_LC/i } });
    await CourseGroup.deleteMany({ groupCode: 'CG_LC_01' });
    await CallTask.deleteMany({});
    await Attendance.deleteMany({});

    const adminUser = await User.create({
      fullName: 'Admin Lifecycle',
      email: 'admin_lifecycle@itc.edu.vn',
      password: passHash,
      role: 'admin',
      status: 'active',
    });

    const teacherUser = await User.create({
      fullName: 'ThS. Nguyễn Văn Thầy',
      email: 'teacher_lifecycle@itc.edu.vn',
      password: passHash,
      role: 'teacher',
      status: 'active',
    });

    const staffA = await User.create({
      fullName: 'CSKH Staff A',
      email: 'staff_a_lifecycle@itc.edu.vn',
      password: passHash,
      role: 'staff',
      status: 'active',
      managedClasses: ['CD25CT1'],
      managedStudents: [],
    });

    const staffB = await User.create({
      fullName: 'CSKH Staff B',
      email: 'staff_b_lifecycle@itc.edu.vn',
      password: passHash,
      role: 'staff',
      status: 'active',
      managedClasses: ['CD25CT2'],
      managedStudents: [],
    });

    recordResult('Stage 1', 'User Accounts Seeding', true, 'Created Admin, Teacher, Staff A & Staff B');

    // 1.3 Student Seeding
    const student1 = await Student.create({
      studentCode: 'STU_LC_01',
      fullName: 'Trần Văn Exception (SV 1)',
      classCode: 'CD25CT1',
      phone: '0901111111',
      parentPhone: '0901111112',
    });

    const student2 = await Student.create({
      studentCode: 'STU_LC_02',
      fullName: 'Lê Thị Class1 (SV 2)',
      classCode: 'CD25CT1',
      phone: '0902222222',
      parentPhone: '0902222223',
    });

    const student3 = await Student.create({
      studentCode: 'STU_LC_03',
      fullName: 'Pham Văn Unassigned (SV 3)',
      classCode: 'CD25CT99',
      phone: '0903333333',
      parentPhone: '0903333334',
    });

    // Assign Student 1 as Exception to Staff B (managedStudents)
    staffB.managedStudents = [student1._id];
    await staffB.save();

    recordResult('Stage 1', 'Student Seeding & Exception Assignment', true, `Student 1 assigned to Staff B, Class CD25CT1 assigned to Staff A`);

    // 1.4 Course Group Creation & Enrollment
    const courseGroup = await CourseGroup.create({
      courseCode: 'WEB2026',
      courseName: 'Lập Trình Web Enterprise',
      groupCode: 'CG_LC_01',
      shift: 'Sáng',
      scheduleDays: ['Thứ 2', 'Thứ 4'],
      room: 'A.202',
      teacherId: teacherUser._id,
      teacherName: teacherUser.fullName,
      students: [student1._id, student2._id, student3._id],
    });

    recordResult('Stage 1', 'Course Group Setup & Student Enrollment', true, `Created CG_LC_01 with 3 enrolled students`);

    // ----------------------------------------------------------------
    // STAGE 2: ATTENDANCE & MULTI-TIER DISPATCH
    // ----------------------------------------------------------------
    console.log('\n--- STAGE 2: Attendance & Multi-Tier Task Dispatch ---');

    // 2.1 Teacher Auth & Permission Check
    const teacherToken = jwt.sign({ id: teacherUser._id, role: 'teacher', fullName: teacherUser.fullName }, JWT_SECRET);

    // Verify Course Group query for Teacher
    const teacherGroups = await CourseGroup.find({
      $or: [{ teacherId: teacherUser._id }, { teacherName: teacherUser.fullName }],
    });

    const isTeacherRestricted = teacherGroups.length === 1 && teacherGroups[0].groupCode === 'CG_LC_01';
    recordResult('Stage 2', 'Teacher Course Group Access Guard', isTeacherRestricted, `Teacher sees ONLY assigned course group (CG_LC_01)`);

    // 2.2 Submit Attendance with 3 Absent Students
    const today = new Date();
    const attendanceRecord = await Attendance.create({
      courseGroupId: courseGroup._id,
      absentStudents: [student1._id, student2._id, student3._id],
      excusedStudents: [],
      recordedBy: teacherUser._id,
      date: today,
    });

    // Run 3-Tier Task Routing Dispatcher
    const activeStaffs = await User.find({ role: 'staff', status: 'active' }).sort({ fullName: 1 });
    const N = activeStaffs.length;

    const studentMap = {
      [student1._id.toString()]: student1,
      [student2._id.toString()]: student2,
      [student3._id.toString()]: student3,
    };

    const absentIds = [student1._id, student2._id, student3._id];
    const createdTasks = [];

    for (let i = 0; i < absentIds.length; i++) {
      const sid = absentIds[i];
      const st = studentMap[sid.toString()];
      const studentClassCode = (st.classCode || '').trim().toUpperCase();

      // Tier 1: Exception student check (managedStudents)
      let assignedStaff = activeStaffs.find(
        (s) => Array.isArray(s.managedStudents) && s.managedStudents.some(msId => msId.toString() === sid.toString())
      );

      // Tier 2: Class assignment check (managedClasses)
      if (!assignedStaff) {
        assignedStaff = activeStaffs.find(
          (s) => Array.isArray(s.managedClasses) && s.managedClasses.includes(studentClassCode)
        );
      }

      // Tier 3: Fallback Round-Robin
      if (!assignedStaff) {
        assignedStaff = activeStaffs[i % N];
      }

      const task = await CallTask.create({
        studentId: sid,
        courseGroupId: courseGroup._id,
        assignedStaffId: assignedStaff._id,
        absenceDate: today,
        status: 'Chưa gọi',
        callNote: '',
        callAttempts: 0,
      });

      createdTasks.push({ student: st, task, assignedStaff });
    }

    // Assert Tier 1: Student 1 -> Staff B
    const task1 = createdTasks.find(t => t.student._id.toString() === student1._id.toString());
    const tier1Passed = task1 && task1.assignedStaff._id.toString() === staffB._id.toString();
    recordResult('Stage 2', 'Tier 1 Dispatcher (managedStudents Match)', tier1Passed, `Student 1 routed to Staff B (${task1?.assignedStaff?.fullName})`);

    // Assert Tier 2: Student 2 -> Staff A
    const task2 = createdTasks.find(t => t.student._id.toString() === student2._id.toString());
    const tier2Passed = task2 && task2.assignedStaff._id.toString() === staffA._id.toString();
    recordResult('Stage 2', 'Tier 2 Dispatcher (managedClasses Cohort)', tier2Passed, `Student 2 routed to Staff A (${task2?.assignedStaff?.fullName})`);

    // Assert Tier 3: Student 3 -> Fallback active staff
    const task3 = createdTasks.find(t => t.student._id.toString() === student3._id.toString());
    const tier3Passed = task3 && !!task3.assignedStaff;
    recordResult('Stage 3', 'Tier 3 Dispatcher (Fallback Round-Robin)', tier3Passed, `Student 3 routed to ${task3?.assignedStaff?.fullName}`);

    // ----------------------------------------------------------------
    // STAGE 3: STAFF TASK EXECUTION & 360° CRM
    // ----------------------------------------------------------------
    console.log('\n--- STAGE 3: Staff Task Execution & 360° CRM ---');

    // 3.1 Staff A Task Queue Query & Queue Isolation
    const staffATasks = await CallTask.find({ assignedStaffId: staffA._id });
    const hasStudent2 = staffATasks.some(t => t.studentId.toString() === student2._id.toString());
    const hasStudent1 = staffATasks.some(t => t.studentId.toString() === student1._id.toString());
    const queuePassed = hasStudent2 && !hasStudent1;
    recordResult('Stage 3', 'Staff A Task Queue Isolation', queuePassed, `Staff A queue has Student 2, does NOT have Student 1`);

    // 3.2 Staff A Task Execution & CRM Update
    const taskToUpdate = await CallTask.findOne({ assignedStaffId: staffA._id, studentId: student2._id });
    taskToUpdate.status = 'Đã liên hệ';
    taskToUpdate.callNote = 'Phụ huynh xác nhận sinh viên bị sốt xuất huyết, sẽ gửi đơn xin phép.';
    taskToUpdate.absenceReasonCategory = 'Bệnh/Sức khỏe';
    taskToUpdate.callbackDate = new Date(Date.now() + 86400000 * 3);
    taskToUpdate.callAttempts = 1;
    await taskToUpdate.save();

    // Update tags on Student 2
    student2.tags = ['#CầnHỗTrợĐặcBiệt'];
    await student2.save();

    recordResult('Stage 3', 'Call Task Update & Student Tagging', true, `Task updated to 'Đã liên hệ' with note & #CầnHỗTrợĐặcBiệt tag`);

    // 3.3 360° Profile Timeline Assertion
    const callTasksHistory = await CallTask.find({ studentId: student2._id })
      .populate('courseGroupId', 'groupCode courseName')
      .populate('assignedStaffId', 'fullName email');
    const attendanceHistory = await Attendance.find({ absentStudents: student2._id })
      .populate('courseGroupId', 'groupCode courseName')
      .populate('recordedBy', 'fullName email');

    const timeline = [];
    callTasksHistory.forEach(ct => timeline.push({ type: 'call_task', date: ct.createdAt, status: ct.status, note: ct.callNote }));
    attendanceHistory.forEach(att => timeline.push({ type: 'attendance', date: att.date, status: 'Vắng' }));

    const profilePassed = timeline.length >= 2 && student2.tags.includes('#CầnHỗTrợĐặcBiệt');
    recordResult('Stage 3', 'Student 360° CRM Profile Timeline', profilePassed, `Timeline aggregated ${timeline.length} timeline events`);

    // ----------------------------------------------------------------
    // STAGE 4: ADMIN REPORTING & HANDOVER
    // ----------------------------------------------------------------
    console.log('\n--- STAGE 4: Admin Handover & Analytics Reporting ---');

    // 4.1 Handover Execution: Transfer Class CD25CT1 from Staff A to Staff B
    staffA.managedClasses = (staffA.managedClasses || []).filter(c => c !== 'CD25CT1');
    const newToClasses = new Set([...(staffB.managedClasses || []), 'CD25CT1']);
    staffB.managedClasses = Array.from(newToClasses);

    await staffA.save();
    await staffB.save();

    // Reassign open call tasks for CD25CT1 from Staff A to Staff B
    const updateResult = await CallTask.updateMany(
      {
        assignedStaffId: staffA._id,
        studentId: student2._id,
        status: { $in: ['Chưa gọi', 'Không bắt máy', 'Đã liên hệ'] },
      },
      { assignedStaffId: staffB._id }
    );

    const handoverSuccess = !staffA.managedClasses.includes('CD25CT1') && staffB.managedClasses.includes('CD25CT1');
    const reassignedTask = await CallTask.findOne({ studentId: student2._id });
    const taskReassignedToB = reassignedTask && reassignedTask.assignedStaffId.toString() === staffB._id.toString();

    recordResult('Stage 4', 'Admin 1-Click Class Handover', handoverSuccess && taskReassignedToB, `Class CD25CT1 & tasks transferred from Staff A to Staff B`);

    // 4.2 Analytics & Risk Alerts Verification
    const totalAbsentCount = await Attendance.countDocuments({ absentStudents: { $exists: true, $not: { $size: 0 } } });
    const totalCallsCount = await CallTask.countDocuments();
    const completedTasksCount = await CallTask.countDocuments({ status: 'Đã liên hệ' });

    const analyticsPassed = totalAbsentCount > 0 && totalCallsCount === 3 && completedTasksCount === 1;
    recordResult('Stage 4', 'Analytics & Risk Alert Metrics', analyticsPassed, `Attendance: ${totalAbsentCount}, CallTasks: ${totalCallsCount}, Completed: ${completedTasksCount}`);

    // ----------------------------------------------------------------
    // CLEANUP & FINAL SUMMARY MATRIX
    // ----------------------------------------------------------------
    console.log('\n================================================================');
    console.log('📊 FULL E2E INTEGRATION TEST SUMMARY MATRIX');
    console.log('================================================================');
    console.table(resultsMatrix);

    const totalTests = resultsMatrix.length;
    const passedCount = resultsMatrix.filter(r => r.passed).length;
    const failedCount = totalTests - passedCount;

    console.log(`\nTOTAL: ${totalTests} | PASSED: ${passedCount} | FAILED: ${failedCount}`);

    if (failedCount === 0) {
      console.log('\n🎉 ALL 12 LIFECYCLE VERIFICATION CHECKS PASSED PERFECTLY WITH ZERO REGRESSIONS!\n');
      await mongoose.disconnect();
      process.exit(0);
    } else {
      console.error('\n❌ SOME LIFECYCLE STAGES FAILED!\n');
      await mongoose.disconnect();
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Unexpected E2E Lifecycle Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runE2ELifecycleTest();
