// Dữ liệu demo đầy đủ cho mọi trang: tài khoản, lớp, sinh viên, học phần, phân lớp CSKH, điểm danh
// ~8 tuần, nhiệm vụ gọi điện, lịch sử cuộc gọi, giao việc và đơn thanh toán.
//
//   npm run seed:demo            chỉ chạy khi chưa có sinh viên
//   npm run seed:demo -- --reset xóa dữ liệu nghiệp vụ (giữ tài khoản & cài đặt) rồi tạo lại
//
// Điểm danh đi qua dichVuDiemDanh.saveAttendance và phân lớp qua dichVuPhanCongLop.assignClass,
// nên nhiệm vụ gọi điện được tạo và chia cho nhân viên đúng như khi dùng app.
require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const NguoiDung = require('../models/NguoiDung');
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const DiemDanh = require('../models/DiemDanh');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const CuocGoi = require('../models/CuocGoi');
const NhiemVu = require('../models/NhiemVu');
const LichSuPhanCong = require('../models/LichSuPhanCong');
const DonThanhToan = require('../models/DonThanhToan');
const CaiDatHeThong = require('../models/CaiDatHeThong');
const { saveAttendance } = require('../services/dichVuDiemDanh');
const { assignClass } = require('../services/dichVuPhanCongLop');
const {
  CALL_STATUS,
  TASK_STATUS,
  SHIFT,
  WEEKDAY_INDEX,
  DEFAULT_SHIFT_TIMES,
  SUBSCRIPTION_PLANS,
  ORDER_STATUS,
} = require('../utils/hangSo');

const DEMO_PASSWORD = '123';
const DAY = 24 * 60 * 60 * 1000;

// Deterministic randomness: the same data on every run.
let seed = 20260925;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const phone = () => `09${String(between(0, 99999999)).padStart(8, '0')}`;

const HO = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Huỳnh',
  'Phan',
  'Vũ',
  'Võ',
  'Đặng',
  'Bùi',
  'Đỗ',
];
const DEM_NAM = ['Văn', 'Hữu', 'Minh', 'Quốc', 'Đức', 'Thành', 'Gia', 'Hoàng'];
const DEM_NU = ['Thị', 'Ngọc', 'Thu', 'Thanh', 'Bảo', 'Mỹ', 'Khánh', 'Phương'];
const TEN_NAM = [
  'An',
  'Bình',
  'Cường',
  'Dũng',
  'Huy',
  'Khang',
  'Long',
  'Nam',
  'Phúc',
  'Quân',
  'Tài',
  'Tuấn',
];
const TEN_NU = [
  'Anh',
  'Chi',
  'Hà',
  'Hân',
  'Linh',
  'Mai',
  'Ngân',
  'Nhi',
  'Oanh',
  'Trang',
  'Vy',
  'Yến',
];

// Administrative classes. CD25DH1 is deliberately left without a CSKH staff member, so its
// absences land in the manager's queue.
const CLASSES = [
  { code: 'CD25CT1', major: 'Công nghệ Thông tin', prefix: '5012500', size: 10 },
  { code: 'CD25CT2', major: 'Công nghệ Thông tin', prefix: '5012501', size: 9 },
  { code: 'CD24TM1', major: 'Thương mại Điện tử', prefix: '6022400', size: 9 },
  { code: 'CD24KT1', major: 'Kế toán', prefix: '7032400', size: 8 },
  { code: 'CD25DH1', major: 'Thiết kế Đồ họa', prefix: '8042500', size: 8 },
];

const SEMESTER_START = new Date(2026, 7, 3); // Thứ 2, 03/08/2026
const SEMESTER_END = new Date(2026, 10, 27);

const GROUPS = [
  {
    courseCode: 'NET101',
    courseName: 'Mạng máy tính cơ bản',
    groupCode: 'NET101_HK1_26.27_CT',
    shift: SHIFT.MORNING,
    scheduleDays: ['thu_2', 'thu_4'],
    room: 'A.201',
    periodsPerSession: 4,
    totalPeriods: 60,
    teacher: 'teacher',
    classes: ['CD25CT1', 'CD25CT2'],
  },
  {
    courseCode: 'WEB202',
    courseName: 'Lập trình Web',
    groupCode: 'WEB202_HK1_26.27_CT',
    shift: SHIFT.EVENING,
    scheduleDays: ['thu_3', 'thu_5'],
    room: 'Lab 03',
    periodsPerSession: 3,
    totalPeriods: 45,
    teacher: 'teacher',
    classes: ['CD25CT1'],
  },
  {
    courseCode: 'DB203',
    courseName: 'Cơ sở dữ liệu',
    groupCode: 'DB203_HK1_26.27_CT2',
    shift: SHIFT.AFTERNOON,
    scheduleDays: ['thu_3', 'thu_6'],
    room: 'Lab 01',
    periodsPerSession: 4,
    totalPeriods: 60,
    teacher: 'teacher2',
    classes: ['CD25CT2'],
  },
  {
    courseCode: 'MKT110',
    courseName: 'Marketing căn bản',
    groupCode: 'MKT110_HK1_26.27_TM',
    shift: SHIFT.MORNING,
    scheduleDays: ['thu_2', 'thu_5'],
    room: 'B.105',
    periodsPerSession: 4,
    totalPeriods: 45,
    teacher: 'teacher2',
    classes: ['CD24TM1'],
  },
  {
    courseCode: 'ACC120',
    courseName: 'Nguyên lý kế toán',
    groupCode: 'ACC120_HK1_26.27_KT',
    shift: SHIFT.AFTERNOON,
    scheduleDays: ['thu_4', 'thu_6'],
    room: 'B.204',
    periodsPerSession: 4,
    totalPeriods: 60,
    teacher: 'chitran15111996@gmail.com',
    classes: ['CD24KT1', 'CD24TM1'],
  },
  {
    courseCode: 'DES130',
    courseName: 'Thiết kế đồ họa 2D',
    groupCode: 'DES130_HK1_26.27_DH',
    shift: SHIFT.MORNING,
    scheduleDays: ['thu_3', 'thu_7'],
    room: 'Lab Mac',
    periodsPerSession: 4,
    totalPeriods: 45,
    teacher: null,
    classes: ['CD25DH1'],
  },
];

// Extra demo accounts; the existing admin / manager / staff / teacher accounts are kept as-is.
const EXTRA_USERS = [
  { email: 'staff2', fullName: 'Trần Thị Mai', role: 'staff', status: 'active' },
  { email: 'teacher2', fullName: 'ThS. Lê Hoàng Phúc', role: 'teacher', status: 'active' },
  { email: 'staff3', fullName: 'Phạm Quốc Bảo', role: 'staff', status: 'inactive' },
  { email: 'gv.moi@itc.edu.vn', fullName: 'Võ Thanh Hà', role: 'teacher', status: 'unverified' },
];

const NOTES_BY_REASON = {
  'Bệnh/Sức khỏe': [
    'Sinh viên bị sốt, đã đi khám, xin nghỉ 2 ngày.',
    'Phụ huynh báo con bị đau dạ dày, đang điều trị.',
    'Bị cảm cúm, hẹn đi học lại tuần sau.',
  ],
  'Việc gia đình': [
    'Về quê có việc gia đình (đám giỗ).',
    'Ở nhà chăm người thân nằm viện.',
    'Gia đình có việc đột xuất, phụ huynh đã xác nhận.',
  ],
  'Bận đi làm': [
    'Đi làm ca tối nên trùng lịch học, đã nhắc sắp xếp lại.',
    'Làm thêm cuối tuần, cam kết đi học đầy đủ.',
    'Bận đi làm, xin tư vấn chuyển nhóm học phần.',
  ],
  'Lý do cá nhân': [
    'Ngủ quên, đã nhắc nhở.',
    'Quên lịch học do đổi phòng, đã gửi lại thời khóa biểu.',
    'Tâm lý không ổn định, đề nghị phòng CTSV hỗ trợ.',
  ],
  Khác: ['Xe hư giữa đường, không kịp đến lớp.', 'Trời mưa ngập đường, không đi được.'],
};

/** Backdates timestamps (Mongoose would otherwise stamp everything "now"). */
const backdate = (Model, id, at, extra = {}) =>
  Model.collection.updateOne({ _id: id }, { $set: { createdAt: at, updatedAt: at, ...extra } });

const atTime = (day, hhmm, jitterMin = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m + jitterMin, 0, 0);
  return d;
};

async function ensureUsers() {
  const password = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of EXTRA_USERS) {
    if (!(await NguoiDung.exists({ email: u.email }))) await NguoiDung.create({ ...u, password });
  }
  const byEmail = async (email) => {
    const user = await NguoiDung.findOne({ email });
    if (!user) throw new Error(`Thiếu tài khoản "${email}" — hãy tạo trước khi seed.`);
    return user;
  };
  return {
    admin: await NguoiDung.findOne({ role: 'admin' }),
    manager: await byEmail('manager'),
    staff: await byEmail('staff'),
    staff2: await byEmail('staff2'),
    teacher: await byEmail('teacher'),
    teacher2: await byEmail('teacher2'),
    teacher3: await NguoiDung.findOne({ email: 'chitran15111996@gmail.com' }),
  };
}

async function reset() {
  await Promise.all(
    [
      SinhVien,
      NhomHocPhan,
      DiemDanh,
      NhiemVuGoiDien,
      CuocGoi,
      NhiemVu,
      LichSuPhanCong,
      DonThanhToan,
    ].map((M) => M.deleteMany({})),
  );
  await NguoiDung.updateMany({}, { $set: { managedClasses: [] } });
}

async function createStudents(tags) {
  const students = [];
  for (const cls of CLASSES) {
    for (let i = 1; i <= cls.size; i++) {
      const female = rand() < 0.5;
      const fullName = `${pick(HO)} ${pick(female ? DEM_NU : DEM_NAM)} ${pick(female ? TEN_NU : TEN_NAM)}`;
      const year = cls.code.startsWith('CD25') ? 2007 : 2006;
      students.push({
        studentCode: `${cls.prefix}${String(i).padStart(2, '0')}`,
        fullName,
        classCode: cls.code,
        dob: `${String(between(1, 28)).padStart(2, '0')}/${String(between(1, 12)).padStart(2, '0')}/${year}`,
        major: cls.major,
        phone: phone(),
        parentPhone: phone(),
        courseGroups: [],
        tags: rand() < 0.2 ? [pick(tags)] : [],
      });
    }
  }
  return SinhVien.insertMany(students);
}

/** Every class day of the group from the semester start up to today. */
function classDays(group, until) {
  const days = group.scheduleDays.map((d) => WEEKDAY_INDEX[d]);
  const result = [];
  for (let d = new Date(SEMESTER_START); d <= until; d = new Date(d.getTime() + DAY)) {
    if (days.includes(d.getDay())) result.push(new Date(d));
  }
  return result;
}

async function main() {
  const resetFirst = process.argv.includes('--reset');
  if (process.env.NODE_ENV === 'production')
    throw new Error('Không chạy seed demo trên production.');
  if (!process.env.MONGO_URI || process.env.USE_MEMORY_DB === 'true')
    throw new Error('Cần MONGO_URI của database đang sử dụng.');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });

  if (resetFirst) await reset();
  else if (await SinhVien.exists({}))
    throw new Error(
      'Database đã có sinh viên. Chạy lại với --reset để xóa dữ liệu nghiệp vụ và tạo mới.',
    );

  const users = await ensureUsers();
  const settings = (await CaiDatHeThong.findOne()) || (await CaiDatHeThong.create({}));
  const reasons = settings.absenceReasons;

  // --- Students and course groups
  const students = await createStudents(settings.tags);
  const byClass = (code) => students.filter((s) => s.classCode === code);
  // A few students skip class a lot, so every warning level has someone in it.
  const absenceRate = new Map(
    students.map((s) => {
      const r = rand();
      return [
        String(s._id),
        r < 0.05 ? 0.3 : r < 0.12 ? 0.16 : r < 0.22 ? 0.11 : r < 0.45 ? 0.05 : 0.015,
      ];
    }),
  );

  const groups = [];
  for (const g of GROUPS) {
    const members = g.classes.flatMap(byClass);
    const teacher = g.teacher
      ? users[Object.keys(users).find((k) => users[k]?.email === g.teacher)]
      : null;
    const { startTime, endTime } = DEFAULT_SHIFT_TIMES[g.shift];
    const group = await NhomHocPhan.create({
      courseCode: g.courseCode,
      courseName: g.courseName,
      groupCode: g.groupCode,
      shift: g.shift,
      scheduleDays: g.scheduleDays,
      startTime,
      endTime,
      periodsPerSession: g.periodsPerSession,
      totalPeriods: g.totalPeriods,
      room: g.room,
      startDate: SEMESTER_START,
      endDate: SEMESTER_END,
      teacherId: teacher?._id ?? null,
      teacherName: teacher?.fullName ?? 'Chưa phân công giảng viên',
      students: members.map((s) => s._id),
    });
    await SinhVien.updateMany(
      { _id: { $in: members.map((s) => s._id) } },
      { $addToSet: { courseGroups: g.groupCode } },
    );
    groups.push({ group, teacher, members });
  }

  // --- CSKH class assignment (history included: CD24KT1 changed hands once)
  const assign = (classCode, staff, reason) =>
    assignClass({ classCode, staffId: staff?._id ?? null, by: users.manager._id, reason });
  await assign('CD25CT1', users.staff);
  await assign('CD25CT2', users.staff);
  await assign('CD24KT1', users.staff);
  await assign('CD24TM1', users.staff2);
  await assign('CD24KT1', users.staff2, 'Cân bằng khối lượng công việc');
  const history = await LichSuPhanCong.find().sort({ createdAt: 1 });
  for (const [i, h] of history.entries()) {
    const at = new Date(SEMESTER_START.getTime() - (10 - i * 2) * DAY);
    await backdate(LichSuPhanCong, h._id, at, { startedAt: at });
    if (h.endedAt)
      await LichSuPhanCong.collection.updateOne(
        { _id: h._id },
        { $set: { endedAt: new Date(2026, 7, 24) } },
      );
  }

  // --- Attendance up to today (the real service creates and routes the call tasks)
  const now = new Date();
  let sessions = 0;
  for (const { group, teacher, members } of groups) {
    const recorder = teacher ?? users.manager;
    for (const day of classDays(group, now)) {
      const start = atTime(day, group.startTime, between(2, 15));
      if (start > now) continue; // today's class has not started yet
      const absent = [];
      const excused = [];
      for (const s of members) {
        if (rand() >= absenceRate.get(String(s._id))) continue;
        if (rand() < 0.15) excused.push({ studentId: String(s._id), reason: pick(reasons) });
        else absent.push(String(s._id));
      }
      const { attendance } = await saveAttendance({
        group,
        user: { id: String(recorder._id) },
        absentStudentIds: absent,
        excusedStudents: excused,
        date: start,
      });
      await backdate(DiemDanh, attendance._id, start);
      sessions++;
    }
  }

  // --- Work the call tasks: older ones mostly handled, recent ones still open
  const tasks = await NhiemVuGoiDien.find().populate('studentId');
  const staffById = new Map([users.staff, users.staff2].map((u) => [String(u._id), u]));
  let calls = 0;
  for (const task of tasks) {
    const student = task.studentId;
    const ageDays = (now - task.absenceDate) / DAY;
    const caller = staffById.get(String(task.assignedStaffId));
    const r = rand();
    const outcome =
      // The manager's queue (class without CSKH staff) has not been picked up yet.
      !caller || ageDays < 2
        ? 'pending'
        : r < (ageDays > 7 ? 0.72 : 0.45)
          ? 'contacted'
          : r < 0.9
            ? 'unreachable'
            : 'pending';
    await backdate(NhiemVuGoiDien, task._id, task.absenceDate);
    if (outcome === 'pending') continue;

    const attempts = outcome === 'contacted' ? between(1, 2) : between(1, 3);
    let callAt = atTime(new Date(task.absenceDate.getTime() + DAY), '08:30', between(0, 420));
    for (let a = 1; a <= attempts; a++) {
      if (callAt > now) callAt = new Date(now.getTime() - between(30, 300) * 60 * 1000);
      const answered = outcome === 'contacted' && a === attempts;
      const target = rand() < 0.6 ? 'sinh_vien' : 'phu_huynh';
      const reason = pick(reasons);
      const durationSec = answered ? between(45, 360) : 0;
      const call = await CuocGoi.create({
        callerId: caller._id,
        callerRole: caller.role,
        studentId: student._id,
        target,
        phoneNumber: target === 'phu_huynh' ? student.parentPhone : student.phone,
        method: rand() < 0.3 ? 'stringee' : 'dien_thoai',
        callTaskId: task._id,
        courseGroupId: task.courseGroupId,
        status: 'ket_thuc',
        outcome: answered ? 'nghe_may' : pick(['khong_nghe_may', 'khong_nghe_may', 'may_ban']),
        note: answered ? pick(NOTES_BY_REASON[reason] ?? NOTES_BY_REASON.Khác) : '',
        startedAt: callAt,
        endedAt: new Date(callAt.getTime() + (durationSec + 20) * 1000),
        durationSec,
      });
      await backdate(CuocGoi, call._id, callAt);
      calls++;
      if (answered) {
        task.callNote = call.note;
        task.absenceReasonCategory = reason;
      }
      callAt = new Date(callAt.getTime() + between(3, 26) * 60 * 60 * 1000);
    }
    task.status = outcome === 'contacted' ? CALL_STATUS.CONTACTED : CALL_STATUS.UNREACHABLE;
    task.callAttempts = attempts;
    if (outcome === 'unreachable') {
      task.callNote = 'Gọi nhiều lần không bắt máy, sẽ gọi lại cho phụ huynh.';
      if (rand() < 0.6) task.callbackDate = new Date(now.getTime() + between(1, 4) * DAY);
    }
    await task.save();
    await NhiemVuGoiDien.collection.updateOne({ _id: task._id }, { $set: { updatedAt: callAt } });
  }

  // Teachers also call parents directly from the attendance page (not tied to a task).
  for (const { group, teacher, members } of groups.filter((g) => g.teacher)) {
    for (let i = 0; i < 2; i++) {
      const student = pick(members);
      const at = new Date(now.getTime() - between(1, 20) * DAY);
      at.setHours(between(13, 20), between(0, 59));
      const durationSec = between(60, 240);
      const call = await CuocGoi.create({
        callerId: teacher._id,
        callerRole: 'teacher',
        studentId: student._id,
        target: 'phu_huynh',
        phoneNumber: student.parentPhone,
        method: 'dien_thoai',
        courseGroupId: group._id,
        status: 'ket_thuc',
        outcome: 'nghe_may',
        note: 'Trao đổi với phụ huynh về tình hình chuyên cần của sinh viên.',
        startedAt: at,
        endedAt: new Date(at.getTime() + durationSec * 1000),
        durationSec,
      });
      await backdate(CuocGoi, call._id, at);
      calls++;
    }
  }

  // --- Internal tasks from the manager to CSKH staff, one per status
  const daysAgo = (n, h = 9) => {
    const d = new Date(now.getTime() - n * DAY);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const internal = [
    {
      to: users.staff,
      title: 'Gọi điện nhắc lịch thi giữa kỳ lớp CD25CT1',
      description:
        'Liên hệ toàn bộ sinh viên lớp CD25CT1 nhắc lịch thi giữa kỳ tuần sau và xác nhận phòng thi.',
      created: daysAgo(1),
      due: 5,
      status: TASK_STATUS.PENDING,
    },
    {
      to: users.staff2,
      title: 'Cập nhật số điện thoại phụ huynh lớp CD24TM1',
      description:
        'Rà soát và cập nhật số điện thoại phụ huynh còn thiếu hoặc sai trong hồ sơ lớp CD24TM1.',
      created: daysAgo(3),
      due: 4,
      status: TASK_STATUS.ACKNOWLEDGED,
      acknowledged: daysAgo(2, 14),
    },
    {
      to: users.staff,
      title: 'Báo cáo sinh viên vắng quá 20% môn Mạng máy tính',
      description:
        'Tổng hợp danh sách sinh viên vắng trên 20% số tiết môn NET101, kèm kết quả liên hệ.',
      created: daysAgo(6),
      due: 1,
      status: TASK_STATUS.SUBMITTED,
      acknowledged: daysAgo(5, 10),
      submitted: daysAgo(1, 16),
      evidenceNote: 'Đã tổng hợp 4 sinh viên, đính kèm bảng tính trên Drive.',
      evidenceLink: 'https://drive.google.com/demo-bao-cao-net101',
    },
    {
      to: users.staff2,
      title: 'Tư vấn học phí cho sinh viên khó khăn',
      description:
        'Liên hệ các sinh viên gắn tag #KhóKhănHọcPhí để hướng dẫn thủ tục giãn học phí.',
      created: daysAgo(14),
      due: -7,
      status: TASK_STATUS.COMPLETED,
      acknowledged: daysAgo(13, 9),
      submitted: daysAgo(9, 15),
      completed: daysAgo(8, 10),
      evidenceNote: 'Đã tư vấn 3 sinh viên, 2 em đã nộp đơn.',
      reviewNote: 'Tốt, tiếp tục theo dõi hồ sơ.',
    },
    {
      to: users.staff,
      title: 'Khảo sát lý do nghỉ học lớp CD25CT2',
      description: 'Gọi khảo sát nhanh lý do nghỉ học của sinh viên CD25CT2 trong tháng 9.',
      created: daysAgo(10),
      due: -2,
      status: TASK_STATUS.REJECTED,
      acknowledged: daysAgo(9, 9),
      submitted: daysAgo(3, 17),
      evidenceNote: 'Đã gọi 5 sinh viên.',
      reviewNote: 'Chưa đủ: cần khảo sát toàn bộ lớp và ghi rõ lý do từng em.',
    },
  ];
  for (const t of internal) {
    const task = await NhiemVu.create({
      title: t.title,
      description: t.description,
      assignedBy: users.manager._id,
      assignedTo: t.to._id,
      dueDate: new Date(now.getTime() + t.due * DAY),
      status: t.status,
      evidenceNote: t.evidenceNote ?? '',
      evidenceLink: t.evidenceLink ?? '',
      reviewNote: t.reviewNote ?? '',
      reviewedBy: t.reviewNote ? users.manager._id : null,
      acknowledgedAt: t.acknowledged ?? null,
      submittedAt: t.submitted ?? null,
      completedAt: t.completed ?? null,
    });
    await backdate(NhiemVu, task._id, t.created, {
      updatedAt: t.completed ?? t.submitted ?? t.acknowledged ?? t.created,
    });
  }

  // --- Billing history: past orders that did not change the subscription
  if (users.admin) {
    const plan = SUBSCRIPTION_PLANS[1];
    const orders = [
      { status: ORDER_STATUS.CANCELLED, at: daysAgo(20, 10) },
      { status: ORDER_STATUS.EXPIRED, at: daysAgo(12, 15) },
    ];
    for (const [i, o] of orders.entries()) {
      const order = await DonThanhToan.create({
        orderCode: 900000 + i,
        planCode: plan.code,
        planName: plan.name,
        months: plan.months,
        amount: plan.amount,
        status: o.status,
        createdBy: users.admin._id,
      });
      await backdate(DonThanhToan, order._id, o.at);
    }
  }

  const count = async (Model, filter = {}) => Model.countDocuments(filter);
  console.log('✅ Đã tạo dữ liệu demo:');
  console.table({
    'Sinh viên': await count(SinhVien),
    'Lớp hành chính': CLASSES.length,
    'Nhóm học phần': groups.length,
    'Buổi điểm danh': sessions,
    'Nhiệm vụ gọi điện': await count(NhiemVuGoiDien),
    '  – chưa gọi': await count(NhiemVuGoiDien, { status: CALL_STATUS.PENDING }),
    '  – hàng chờ Trưởng phòng': await count(NhiemVuGoiDien, { assignedStaffId: null }),
    'Cuộc gọi': calls,
    'Nhiệm vụ giao việc': internal.length,
  });
  console.log(
    `Tài khoản mới (mật khẩu "${DEMO_PASSWORD}"): ${EXTRA_USERS.map((u) => u.email).join(', ')}`,
  );
}

main()
  .catch((error) => {
    console.error('❌', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
