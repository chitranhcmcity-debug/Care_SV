// Dữ liệu demo đầy đủ cho mọi trang: tài khoản, lớp, sinh viên, học phần, phân lớp CSSV, điểm danh
// ~8 tuần, hồ sơ chăm sóc (đang chăm sóc, chờ chỉ đạo, chờ duyệt, đã kết thúc), cuộc gọi, giao
// việc và đơn thanh toán.
//
//   npm run seed:demo            chỉ chạy khi chưa có sinh viên
//   npm run seed:demo -- --reset xóa dữ liệu nghiệp vụ (giữ tài khoản & cài đặt) rồi tạo lại
//
// Điểm danh đi qua dichVuDiemDanh.saveAttendance và phân lớp qua dichVuPhanCongLop.assignClass,
// nên hồ sơ chăm sóc được mở (khi chạm mức cảnh báo) và giao cho nhân viên đúng như khi dùng app.
require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const NguoiDung = require('../models/NguoiDung');
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const DiemDanh = require('../models/DiemDanh');
const HoSoChamSoc = require('../models/HoSoChamSoc');
const CuocGoi = require('../models/CuocGoi');
const NhiemVu = require('../models/NhiemVu');
const LichSuPhanCong = require('../models/LichSuPhanCong');
const DonThanhToan = require('../models/DonThanhToan');
const CaiDatHeThong = require('../models/CaiDatHeThong');
const { saveAttendance } = require('../services/dichVuDiemDanh');
const { assignClass } = require('../services/dichVuPhanCongLop');
const {
  CARE_STATUS,
  DEFAULT_CARE_STEPS,
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

// Administrative classes. CD25DH1 is deliberately left without a CSSV staff member, so its
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
  // Self sign-ups: one waiting for a manager, one approved and waiting for its key.
  { email: 'gv.moi@itc.edu.vn', fullName: 'Võ Thanh Hà', role: 'teacher', status: 'pending' },
  { email: 'nv.moi@itc.edu.vn', fullName: 'Đặng Minh Khoa', role: 'staff', status: 'awaiting_key' },
];
// Activation key of the approved demo sign-up (the real one is emailed; see routes/xacThuc.js).
const DEMO_ACTIVATION_KEY = 'DEMO-KEYS-2026';
const keyHash = (key) =>
  crypto
    .createHash('sha256')
    .update(key.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .digest('hex');

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
  const manager = await NguoiDung.findOne({ email: 'manager' });
  for (const u of EXTRA_USERS) {
    if (await NguoiDung.exists({ email: u.email })) continue;
    const key =
      u.status === 'awaiting_key'
        ? {
            activationKeyHash: keyHash(DEMO_ACTIVATION_KEY),
            activationKeyExpires: new Date(Date.now() + 7 * DAY),
            approvedBy: manager?._id ?? null,
          }
        : {};
    await NguoiDung.create({ ...u, ...key, password });
  }
  const byEmail = async (email) => {
    const user = await NguoiDung.findOne({ email });
    if (!user) throw new Error(`Thiếu tài khoản "${email}" — hãy tạo trước khi seed.`);
    return user;
  };
  return {
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
      HoSoChamSoc,
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

  // --- CSSV class assignment (history included: CD24KT1 changed hands once)
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
      const { attendance, openedCases } = await saveAttendance({
        group,
        user: { id: String(recorder._id) },
        absentStudentIds: absent,
        excusedStudents: excused,
        date: start,
      });
      await backdate(DiemDanh, attendance._id, start);
      for (const opened of openedCases) {
        const at = new Date(start.getTime() + 2 * 60 * 60 * 1000);
        await backdate(HoSoChamSoc, opened.caseId, at, {
          directedAt: at,
          'notes.$[].createdAt': at,
        });
      }
      sessions++;
    }
  }

  // --- Work the care cases: older ones further along (closed / waiting for approval),
  // recent ones still in progress. Calls are logged against the case.
  const cases = await HoSoChamSoc.find().populate('studentId');
  const staffById = new Map([users.staff, users.staff2].map((u) => [String(u._id), u]));
  let calls = 0;
  const CAUSES = Object.keys(NOTES_BY_REASON);
  const SOLUTIONS = [
    'Thống nhất lịch đi học đều, cam kết không nghỉ không phép.',
    'Hướng dẫn làm đơn xin phép và học bù các buổi đã nghỉ.',
    'Kết nối phòng CTSV hỗ trợ học bổng / giãn học phí.',
    'Phối hợp phụ huynh theo dõi, nhắc lịch học hằng tuần.',
  ];
  const addNote = (c, kind, text, authorId, at) =>
    c.notes.push({ kind, text, authorId, createdAt: at });
  const tick = (c, count, at) =>
    c.steps.slice(0, count).forEach((st) => Object.assign(st, { done: true, doneAt: at }));

  for (const c of cases) {
    const student = c.studentId;
    const opened = c.createdAt;
    const ageDays = (now - opened) / DAY;
    let caller = staffById.get(String(c.assignedStaffId));
    // A class without CSSV staff: the manager directs someone after a day or two.
    if (!caller && ageDays > 2) {
      caller = users.staff2;
      const at = new Date(opened.getTime() + between(1, 2) * DAY);
      Object.assign(c, {
        assignedStaffId: caller._id,
        status: CARE_STATUS.IN_PROGRESS,
        directedBy: users.manager._id,
        directedAt: at,
        directive: 'Liên hệ gia đình trong tuần này, báo lại nguyên nhân cho phòng.',
        dueDate: new Date(at.getTime() + 7 * DAY),
      });
      addNote(c, 'su_kien', `Chỉ đạo ${caller.fullName} chăm sóc`, users.manager._id, at);
      addNote(c, 'chi_dao', c.directive, users.manager._id, at);
    }
    if (!caller) {
      await c.save();
      continue;
    }

    // Calls: one to three tries, the last one answered for cases older than a couple of days.
    const attempts = ageDays < 1 ? 0 : between(1, 3);
    let callAt = atTime(new Date(opened.getTime() + DAY), '08:30', between(0, 420));
    for (let a = 1; a <= attempts; a++) {
      if (callAt > now) callAt = new Date(now.getTime() - between(30, 300) * 60 * 1000);
      const answered = a === attempts && ageDays > 2;
      const target = rand() < 0.6 ? 'sinh_vien' : 'phu_huynh';
      const durationSec = answered ? between(45, 360) : 0;
      const cause = pick(CAUSES);
      const call = await CuocGoi.create({
        callerId: caller._id,
        callerRole: caller.role,
        studentId: student._id,
        target,
        phoneNumber: target === 'phu_huynh' ? student.parentPhone : student.phone,
        method: rand() < 0.3 ? 'stringee' : 'dien_thoai',
        careCaseId: c._id,
        status: 'ket_thuc',
        outcome: answered ? 'nghe_may' : pick(['khong_nghe_may', 'khong_nghe_may', 'may_ban']),
        note: answered ? pick(NOTES_BY_REASON[cause]) : '',
        record: rand() < 0.5,
        startedAt: callAt,
        endedAt: new Date(callAt.getTime() + (durationSec + 20) * 1000),
        durationSec,
      });
      await backdate(CuocGoi, call._id, callAt);
      calls++;
      addNote(
        c,
        'cuoc_goi',
        `Gọi ${target === 'phu_huynh' ? 'phụ huynh' : 'sinh viên'} — ${answered ? 'nghe máy' : 'không liên lạc được'}${call.note ? `: ${call.note}` : ''}`,
        caller._id,
        callAt,
      );
      if (answered) {
        tick(c, 1, callAt);
        c.cause = `${cause}: ${call.note}`;
        tick(c, 2, callAt);
        addNote(c, 'su_kien', `Cập nhật — Nguyên nhân: ${c.cause}`, caller._id, callAt);
      }
      callAt = new Date(callAt.getTime() + between(3, 26) * 60 * 60 * 1000);
    }

    if (c.cause && ageDays > 5) {
      c.solution = pick(SOLUTIONS);
      tick(c, 3, callAt);
      addNote(c, 'su_kien', `Cập nhật — Hướng giải quyết: ${c.solution}`, caller._id, callAt);
    }
    if (ageDays > 6 && rand() < 0.3)
      addNote(
        c,
        'kho_khan',
        'Phụ huynh ở xa, khó liên lạc giờ hành chính. Xin ý kiến hướng xử lý.',
        caller._id,
        callAt,
      );
    if (c.solution && ageDays > 12) {
      tick(c, DEFAULT_CARE_STEPS.length, callAt);
      const result = rand() < 0.7 ? 'tien_bo' : rand() < 0.5 ? 'on_dinh' : 'khong_tien_bo';
      const proposedAt = new Date(Math.min(now - DAY, callAt.getTime() + 3 * DAY));
      c.closing = {
        result,
        summary: 'Sinh viên đã đi học trở lại đều đặn sau khi được trao đổi và hỗ trợ.',
        early: rand() < 0.3,
        proposedBy: caller._id,
        proposedAt,
      };
      c.status = CARE_STATUS.CLOSING;
      addNote(c, 'su_kien', 'Đề nghị kết thúc hồ sơ', caller._id, proposedAt);
      if (ageDays > 18) {
        c.status = CARE_STATUS.CLOSED;
        c.closing.approvedBy = users.manager._id;
        c.closing.closedAt = new Date(proposedAt.getTime() + DAY);
        addNote(c, 'su_kien', 'Đã duyệt kết thúc hồ sơ', users.manager._id, c.closing.closedAt);
      }
    }
    await c.save();
    await HoSoChamSoc.collection.updateOne(
      { _id: c._id },
      { $set: { createdAt: opened, updatedAt: callAt > now ? now : callAt } },
    );
  }

  // Two cases proposed by lecturers for students showing signs of dropping out.
  // Groups share students, so remember who already has a case (one open case per student).
  const withCase = new Set(cases.map((c) => String(c.studentId._id)));
  for (const { group, teacher, members } of groups.filter((g) => g.teacher).slice(0, 2)) {
    const student = members.find((m) => !withCase.has(String(m._id)));
    if (!student) continue;
    withCase.add(String(student._id));
    const at = new Date(now.getTime() - between(1, 3) * DAY);
    const careCase = await HoSoChamSoc.create({
      studentId: student._id,
      source: 'de_xuat',
      reason: 'Sinh viên có biểu hiện chán học, hay bỏ tiết cuối, cần tư vấn định hướng.',
      proposedBy: teacher._id,
      status: CARE_STATUS.AWAITING,
      steps: DEFAULT_CARE_STEPS.map((title) => ({ title, source: 'mac_dinh' })),
      notes: [
        {
          kind: 'su_kien',
          text: `Mở hồ sơ: Đề xuất chăm sóc (${group.groupCode})`,
          authorId: teacher._id,
          createdAt: at,
        },
      ],
    });
    await backdate(HoSoChamSoc, careCase._id, at);
  }

  // Lecturers also call parents directly after taking attendance (not tied to a case).
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
        record: false,
        startedAt: at,
        endedAt: new Date(at.getTime() + durationSec * 1000),
        durationSec,
      });
      await backdate(CuocGoi, call._id, at);
      calls++;
    }
  }

  // --- Internal tasks from the manager to CSSV staff, one per status
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
      category: 'dao_tao',
      priority: 'cao',
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
      category: 'cong_tac_sv',
      priority: 'trung_binh',
      progressLog: [
        { percent: 30, note: 'Đã rà soát 12/40 hồ sơ.', at: daysAgo(2, 16) },
        { percent: 60, note: 'Đã cập nhật xong nửa lớp.', at: daysAgo(1, 11) },
      ],
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
      category: 'bao_cao',
      priority: 'khan_cap',
      progressLog: [{ percent: 50, note: 'Đã lọc danh sách vắng.', at: daysAgo(3, 15) }],
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
      reviewScore: 5,
      category: 'cham_soc_sv',
      priority: 'cao',
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
      reworkCount: 1,
      category: 'cong_tac_sv',
      priority: 'thap',
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
      category: t.category ?? 'khac',
      priority: t.priority ?? 'trung_binh',
      // Handed-in work counts as done; in-progress work shows its latest report.
      progress: t.submitted ? 100 : (t.progressLog?.at(-1)?.percent ?? 0),
      progressLog: t.progressLog ?? [],
      reviewScore: t.reviewScore ?? null,
      reworkCount: t.reworkCount ?? 0,
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

  // --- Billing history (a Trưởng phòng / PHT buys): history only, the subscription is untouched
  {
    const [monthly, halfYear] = SUBSCRIPTION_PLANS;
    const orders = [
      {
        plan: monthly,
        status: ORDER_STATUS.PAID,
        at: daysAgo(40, 9),
        paid: daysAgo(40, 9),
        reference: 'FT26DEMO0001',
      },
      { plan: halfYear, status: ORDER_STATUS.CANCELLED, at: daysAgo(20, 10) },
      { plan: halfYear, status: ORDER_STATUS.EXPIRED, at: daysAgo(12, 15) },
    ];
    for (const [i, o] of orders.entries()) {
      const order = await DonThanhToan.create({
        orderCode: 900000 + i,
        planCode: o.plan.code,
        planName: o.plan.name,
        months: o.plan.months,
        amount: o.plan.amount,
        status: o.status,
        createdBy: users.manager._id,
        paidAt: o.paid ?? null,
        reference: o.reference ?? '',
        extendedTo: o.paid ? new Date(o.paid.getTime() + 30 * DAY) : null,
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
    'Hồ sơ chăm sóc': await count(HoSoChamSoc),
    '  – chờ chỉ đạo': await count(HoSoChamSoc, { status: CARE_STATUS.AWAITING }),
    '  – đang chăm sóc': await count(HoSoChamSoc, { status: CARE_STATUS.IN_PROGRESS }),
    '  – chờ duyệt kết thúc': await count(HoSoChamSoc, { status: CARE_STATUS.CLOSING }),
    '  – đã kết thúc': await count(HoSoChamSoc, { status: CARE_STATUS.CLOSED }),
    'Cuộc gọi': calls,
    'Nhiệm vụ giao việc': internal.length,
  });
  console.log(
    `Tài khoản mới (mật khẩu "${DEMO_PASSWORD}"): ${EXTRA_USERS.map((u) => u.email).join(', ')}`,
  );
  console.log(
    `nv.moi@itc.edu.vn đã được duyệt: đăng nhập rồi nhập key kích hoạt ${DEMO_ACTIVATION_KEY}.`,
  );
}

main()
  .catch((error) => {
    console.error('❌', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
