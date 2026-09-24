const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-test-secret-with-at-least-32-characters';
// AI routes must fail gracefully (503) rather than call a real API in tests.
delete process.env.ANTHROPIC_API_KEY;
// Account emails must never reach a real SMTP server from tests.
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
// Tests that need email switch SMTP "on" and read what would have been sent from here.
const sentMails = [];
require('nodemailer').createTransport = () => ({
  sendMail: async (mail) => {
    sentMails.push(mail);
  },
});
function withFakeSmtp(fn) {
  return async () => {
    process.env.SMTP_USER = 'test@itc.edu.vn';
    process.env.SMTP_PASS = 'test';
    try {
      await fn();
    } finally {
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
    }
  };
}
// The one-time token inside the most recent email sent to `to`.
function tokenFromMail(to) {
  const mail = sentMails.findLast((m) => m.to === to);
  assert.ok(mail, `no email was sent to ${to}`);
  return new URL(/https?:\/\/\S+/.exec(mail.text)[0]).searchParams.get('token');
}
const app = require('../app');
const NguoiDung = require('../models/NguoiDung');
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const DiemDanh = require('../models/DiemDanh');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const Settings = require('../models/CaiDatHeThong');
const NhiemVu = require('../models/NhiemVu');
const DonThanhToan = require('../models/DonThanhToan');
const CuocGoi = require('../models/CuocGoi');
const fs = require('fs');
const path = require('path');
const payosService = require('../services/dichVuPayOS');
const { getConfig } = require('../utils/moiTruong');
const { dateKey } = require('../utils/kiemTra');
const { CALL_STATUS, CALL_STATUSES, TASK_STATUS } = require('../utils/hangSo');
const { escapeHtml } = require('../services/dichVuEmail');
let database, server, base, users, tokens, students, group, otherGroup;

async function request(path, token, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
const sign = (user) =>
  jwt.sign(
    { id: String(user._id), role: user.role, tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

before(async () => {
  database = await MongoMemoryServer.create();
  await mongoose.connect(database.getUri(), { dbName: 'isolated_regression' });
  await Promise.all([
    NguoiDung.init(),
    SinhVien.init(),
    NhomHocPhan.init(),
    DiemDanh.init(),
    NhiemVuGoiDien.init(),
  ]);
  const password = await bcrypt.hash('test-password', 4);
  users = {};
  tokens = {};
  for (const [key, role] of [
    ['admin', 'admin'],
    ['teacher', 'teacher'],
    ['staff', 'staff'],
    ['other', 'staff'],
    ['manager', 'manager'],
  ]) {
    users[key] = await NguoiDung.create({
      fullName: key,
      email: `${key}@example.test`,
      password,
      role,
    });
    tokens[key] = sign(users[key]);
  }
  students = await SinhVien.create([
    { studentCode: 'TEST001', fullName: 'Student A', classCode: 'TEST' },
    { studentCode: 'TEST002', fullName: 'Student B', classCode: 'OTHER' },
  ]);
  group = await NhomHocPhan.create({
    groupCode: 'TEST-GROUP',
    teacherId: users.teacher._id,
    students: [students[0]._id],
  });
  otherGroup = await NhomHocPhan.create({
    groupCode: 'OTHER-GROUP',
    teacherName: 'teacher',
    students: [students[1]._id],
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (database) await database.stop();
});

test('staff cannot use global administrative APIs', async () => {
  for (const path of ['/call-tasks/admin-all', '/course-groups', '/auth/class-assignments']) {
    assert.equal((await request(path, tokens.staff)).status, 403, path);
  }
  // Staff may read reports; teachers may not.
  assert.equal((await request('/analytics/summary', tokens.staff)).status, 200);
  assert.equal((await request('/analytics/summary', tokens.teacher)).status, 403);
  assert.equal(
    (await request('/call-tasks/cleanup-duplicates', tokens.teacher, 'POST', {})).status,
    403,
  );
});
test('all=true cannot bypass course assignment and name matching does not grant access', async () => {
  const result = await request('/attendance/course-groups?all=true', tokens.teacher);
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.body.map((g) => g._id),
    [String(group._id)],
  );
  for (const endpoint of ['history', 'today', 'schedule', 'summary']) {
    assert.equal(
      (await request(`/attendance/${endpoint}/${otherGroup._id}`, tokens.teacher)).status,
      403,
    );
  }
});
test('invalid IDs and invalid login payloads return 400', async () => {
  assert.equal((await request('/attendance/history/not-an-id', tokens.admin)).status, 400);
  assert.equal(
    (await request('/auth/login', null, 'POST', { email: {}, password: {} })).status,
    400,
  );
});
test('attendance rejects nonmembers, duplicates, overlap and invalid dates', async () => {
  const valid = { courseGroupId: String(group._id), absentStudentIds: [String(students[0]._id)] };
  for (const changes of [
    { absentStudentIds: [String(students[1]._id)] },
    { absentStudentIds: [String(students[0]._id), String(students[0]._id)] },
    { absentStudentIds: 'bad' },
    { excusedStudents: [{ studentId: String(students[0]._id) }] },
    { date: 'invalid' },
  ])
    assert.equal(
      (await request('/attendance/submit', tokens.teacher, 'POST', { ...valid, ...changes }))
        .status,
      400,
    );
  assert.equal(await DiemDanh.countDocuments(), 0);
});
test('past attendance preserves date and recorder; repeated/concurrent submits do not duplicate tasks', async () => {
  const payload = {
    courseGroupId: String(group._id),
    absentStudentIds: [String(students[0]._id)],
    date: '2026-01-12T12:00:00',
    teacherId: String(users.admin._id),
  };
  const result = await request('/attendance/submit', tokens.teacher, 'POST', payload);
  assert.equal(result.status, 201);
  assert.equal(result.body.attendance.recordedBy, String(users.teacher._id));
  for (const response of await Promise.all([
    request('/attendance/submit', tokens.teacher, 'POST', payload),
    request('/attendance/submit', tokens.teacher, 'POST', payload),
  ]))
    assert.equal(response.status, 200);
  assert.equal(await DiemDanh.countDocuments(), 1);
  assert.equal(await NhiemVuGoiDien.countDocuments(), 1);
  const task = await NhiemVuGoiDien.findOne();
  assert.equal(dateKey(task.absenceDate), '2026-01-12');
});
test('task ownership prevents modifying another staff task or student profile', async () => {
  const task = await NhiemVuGoiDien.findOne();
  const other = String(task.assignedStaffId) === String(users.staff._id) ? 'other' : 'staff';
  assert.equal(
    (
      await request(`/call-tasks/${task._id}/update`, tokens[other], 'PUT', {
        status: CALL_STATUS.CONTACTED,
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(`/call-tasks/student-360/${students[0]._id}`, tokens[other])).status,
    403,
  );
  assert.equal(
    (
      await request(`/call-tasks/student-tags/${students[0]._id}`, tokens[other], 'PUT', {
        tags: ['x'],
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(`/call-tasks/${task._id}/update`, tokens.admin, 'PUT', { status: 'invalid' }))
      .status,
    400,
  );
});
test('attendance history edits enforce ownership and reconcile untouched tasks', async () => {
  const record = await DiemDanh.findOne();
  assert.equal(
    (
      await request(`/attendance/history/${record._id}`, tokens.other, 'PUT', {
        absentStudentIds: [],
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(`/attendance/history/${record._id}`, tokens.other, 'DELETE')).status,
    403,
  );
  assert.equal(
    (
      await request(`/attendance/history/${record._id}`, tokens.teacher, 'PUT', {
        absentStudentIds: [],
      })
    ).status,
    200,
  );
  assert.equal(await NhiemVuGoiDien.countDocuments(), 0);
});
test('admin-only assignment sends tasks to admin and deletion cleans untouched tasks', async () => {
  // Settings is a singleton (the subscription check may already have created it).
  await Settings.updateOne({}, { taskAssignmentRule: 'admin-only' }, { upsert: true });
  const result = await request('/attendance/submit', tokens.admin, 'POST', {
    courseGroupId: String(group._id),
    absentStudentIds: [String(students[0]._id)],
    date: '2026-01-13T12:00:00',
  });
  assert.equal(result.status, 201);
  assert.equal(String((await NhiemVuGoiDien.findOne()).assignedStaffId), String(users.admin._id));
  assert.equal(
    (await request(`/attendance/history/${result.body.attendance._id}`, tokens.admin, 'DELETE'))
      .status,
    200,
  );
  assert.equal(await NhiemVuGoiDien.countDocuments(), 0);
});
test('invalid settings do not silently save defaults', async () => {
  for (const value of [0, -1, 'no', 2.5])
    assert.equal(
      (await request('/settings', tokens.admin, 'PUT', { examBanThreshold: value })).status,
      400,
    );
});
test('disabled and re-enabled accounts cannot reuse old tokens', async () => {
  assert.equal(
    (
      await request(`/auth/staff/${users.other._id}/status`, tokens.admin, 'PUT', {
        status: 'inactive',
      })
    ).status,
    200,
  );
  assert.equal((await request('/call-tasks/my-tasks', tokens.other)).status, 401);
  await request(`/auth/staff/${users.other._id}/status`, tokens.admin, 'PUT', { status: 'active' });
  assert.equal((await request('/call-tasks/my-tasks', tokens.other)).status, 401);
});

test('create-staff and reset-password report emailSent=false when SMTP is not configured', async () => {
  const created = await request('/auth/create-staff', tokens.admin, 'POST', {
    fullName: '<b>Mail Test</b>',
    email: 'mail-test@itc.edu.vn',
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.emailSent, false);
  assert.equal(created.body.generatedPassword.length, 16);

  const reset = await request(
    `/auth/staff/${created.body.staff.id}/reset-password`,
    tokens.admin,
    'POST',
    {},
  );
  assert.equal(reset.status, 200);
  assert.equal(reset.body.emailSent, false);
  assert.notEqual(reset.body.newPassword, created.body.generatedPassword);
  await NguoiDung.deleteOne({ _id: created.body.staff.id });
});

test('account emails escape user-provided HTML', () => {
  assert.equal(
    escapeHtml(`<b>"A" & 'B'</b>`),
    '&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;',
  );
});

test(
  'self-registration: teacher/staff only, blocked until the email link is opened',
  withFakeSmtp(async () => {
    const email = 'new-teacher@itc.edu.vn';
    const payload = { fullName: 'GV Mới', email, password: 'secret-pass-1', role: 'teacher' };

    assert.equal(
      (await request('/auth/register', null, 'POST', { ...payload, role: 'admin' })).status,
      400,
    );
    assert.equal(
      (await request('/auth/register', null, 'POST', { ...payload, password: 'short' })).status,
      400,
    );

    const registered = await request('/auth/register', null, 'POST', payload);
    assert.equal(registered.status, 201);
    const pending = await NguoiDung.findOne({ email });
    assert.equal(pending.status, 'unverified');
    assert.equal(pending.role, 'teacher');
    assert.notEqual(pending.verifyTokenHash, tokenFromMail(email)); // only the hash is stored

    // Cannot log in before verifying, and a repeat request inside the cooldown is refused.
    const early = await request('/auth/login', null, 'POST', { email, password: payload.password });
    assert.equal(early.status, 403);
    assert.equal((await request('/auth/register', null, 'POST', payload)).status, 429);

    assert.equal(
      (await request('/auth/verify-email', null, 'POST', { token: 'wrong' })).status,
      400,
    );
    const token = tokenFromMail(email);
    assert.equal((await request('/auth/verify-email', null, 'POST', { token })).status, 200);
    assert.equal((await request('/auth/verify-email', null, 'POST', { token })).status, 400);

    const login = await request('/auth/login', null, 'POST', { email, password: payload.password });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, 'teacher');
    // A fresh teacher is assigned no classes, so sees none.
    const groups = await request('/attendance/course-groups', login.body.token);
    assert.equal(groups.status, 200);
    assert.deepEqual(groups.body, []);

    assert.equal((await request('/auth/register', null, 'POST', payload)).status, 409);
    await NguoiDung.deleteOne({ email });
  }),
);

test(
  'forgot/reset password: generic answer, one-time token, old sessions revoked',
  withFakeSmtp(async () => {
    const email = 'forgot-me@itc.edu.vn';
    const user = await NguoiDung.create({
      fullName: 'Forgot Me',
      email,
      password: await bcrypt.hash('old-password-1', 10),
      role: 'staff',
    });
    const oldSession = sign(user);
    const mailsBefore = sentMails.length;

    const unknown = await request('/auth/forgot-password', null, 'POST', {
      email: 'nobody@itc.edu.vn',
    });
    const known = await request('/auth/forgot-password', null, 'POST', { email });
    assert.equal(unknown.status, 200);
    assert.equal(known.status, 200);
    assert.equal(unknown.body.message, known.body.message);
    assert.equal(sentMails.length, mailsBefore + 1);

    const token = tokenFromMail(email);
    assert.equal(
      (await request('/auth/reset-password', null, 'POST', { token, password: 'short' })).status,
      400,
    );
    const reset = await request('/auth/reset-password', null, 'POST', {
      token,
      password: 'new-password-1',
    });
    assert.equal(reset.status, 200);
    assert.equal(
      (await request('/auth/reset-password', null, 'POST', { token, password: 'another-pass-1' }))
        .status,
      400,
    );

    assert.equal((await request('/call-tasks/my-tasks', oldSession)).status, 401);
    const login = await request('/auth/login', null, 'POST', {
      email,
      password: 'new-password-1',
    });
    assert.equal(login.status, 200);
    await NguoiDung.deleteOne({ _id: user._id });
  }),
);

test('password reset revokes token and user responses omit hashes', async () => {
  const response = await request(`/auth/staff/${users.staff._id}`, tokens.admin, 'PUT', {
    password: 'new-test-password',
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.staff.password, undefined);
  assert.equal(response.body.staff.tokenVersion, undefined);
  assert.equal((await request('/call-tasks/my-tasks', tokens.staff)).status, 401);
});
test('middleware reads current role rather than trusting old JWT role', async () => {
  const fakeRoleToken = jwt.sign(
    { id: String(users.teacher._id), role: 'admin' },
    process.env.JWT_SECRET,
  );
  assert.equal((await request('/analytics/summary', fakeRoleToken)).status, 403);
});
test('attendance read endpoints preserve schedules, off-schedule records and summary counts', async () => {
  const course = await NhomHocPhan.create({
    groupCode: 'QUERY-[GROUP]',
    teacherId: users.teacher._id,
    students: [students[0]._id],
    startDate: new Date(2020, 0, 6, 12),
    endDate: new Date(2020, 0, 13, 12),
    scheduleDays: ['thu_2'],
  });
  const records = await DiemDanh.create([
    {
      courseGroupId: course._id,
      date: new Date(2020, 0, 6, 12),
      absentStudents: [students[0]._id],
      recordedBy: users.teacher._id,
    },
    {
      courseGroupId: course._id,
      date: new Date(2020, 0, 7, 12),
      excusedStudents: [{ studentId: students[0]._id, reason: 'Có phép' }],
      recordedBy: users.teacher._id,
    },
  ]);
  const search = await request('/attendance/course-groups?search=%5BGROUP%5D', tokens.teacher);
  assert.equal(search.status, 200);
  assert.deepEqual(
    search.body.map((item) => item._id),
    [String(course._id)],
  );
  const schedule = await request(`/attendance/schedule/${course._id}`, tokens.teacher);
  assert.equal(schedule.status, 200);
  assert.equal(schedule.body.hasDates, true);
  assert.deepEqual(
    schedule.body.sessions.map((item) => [dateKey(item.scheduledDate), item.status]),
    [
      ['2020-01-06', 'recorded'],
      ['2020-01-07', 'recorded'],
      ['2020-01-13', 'missing'],
    ],
  );
  const history = await request(`/attendance/history/${course._id}`, tokens.teacher);
  assert.equal(history.status, 200);
  assert.equal(history.body[0]._id, String(records[1]._id));
  assert.equal(history.body[0].excusedStudents[0].studentId.studentCode, students[0].studentCode);
  const summary = await request(`/attendance/summary/${course._id}`, tokens.teacher);
  assert.equal(summary.status, 200);
  assert.equal(summary.body.totalSessions, 2);
  assert.equal(summary.body.summary[0].absentCount, 1);
  assert.equal(summary.body.summary[0].excusedCount, 1);
  assert.equal(summary.body.summary[0].attendCount, 0);
  const today = await request(`/attendance/today/${course._id}`, tokens.teacher);
  assert.equal(today.status, 200);
  assert.equal(today.body, null);
  const updated = await request(`/attendance/history/${records[0]._id}`, tokens.teacher, 'PUT', {
    absentStudentIds: [],
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.attendance.recordedBy.email, users.teacher.email);
  assert.equal(updated.body.attendance.recordedBy.password, undefined);
  assert.equal(updated.body.attendance.recordedBy.tokenVersion, undefined);
  const fallback = await request(`/attendance/schedule/${group._id}`, tokens.teacher);
  assert.equal(fallback.status, 200);
  assert.equal(fallback.body.hasDates, false);
  assert.ok(fallback.body.sessions.every((item) => item.status === 'recorded'));
});

test('call updates accept every schema status and reject invalid values without saving', async () => {
  const task = await NhiemVuGoiDien.create({
    studentId: students[0]._id,
    courseGroupId: group._id,
    assignedStaffId: users.admin._id,
    absenceDate: new Date(),
  });
  for (const status of CALL_STATUSES) {
    const response = await request(`/call-tasks/${task._id}/update`, tokens.admin, 'PUT', {
      status,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.task.callStatus, status);
  }
  const invalid = await request(`/call-tasks/${task._id}/update`, tokens.admin, 'PUT', {
    status: 'Ch?a g?i',
  });
  assert.equal(invalid.status, 400);
  const saved = await NhiemVuGoiDien.findById(task._id);
  assert.equal(saved.status, CALL_STATUS.CONTACTED);
  // PENDING -> PENDING is not a call; UNREACHABLE and CONTACTED each count once.
  assert.equal(saved.callAttempts, CALL_STATUSES.length - 1);

  const noteOnly = await request(`/call-tasks/${task._id}/update`, tokens.admin, 'PUT', {
    status: CALL_STATUS.CONTACTED,
    callNote: 'edited note',
  });
  assert.equal(noteOnly.status, 200);
  assert.equal(noteOnly.body.task.callAttempts, CALL_STATUSES.length - 1);
});

test('excel import keeps existing phones and home class when cells are blank', async () => {
  const ExcelJS = require('exceljs');
  await SinhVien.create({
    studentCode: 'KEEP00001',
    fullName: 'Keep Me',
    classCode: 'HOMECLASS',
    phone: '0901111111',
    parentPhone: '0902222222',
  });
  await NhomHocPhan.create({ groupCode: 'IMP_GROUP_CD25X' });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('IMP_GROUP_CD25X');
  sheet.addRow(['MSSV', 'Họ và Tên', 'SĐT Sinh Viên', 'SĐT Phụ Huynh']);
  sheet.addRow(['KEEP00001', 'Keep Me', '', '']);
  sheet.addRow(['NEW000001', 'Brand New', '0903333333', '']);
  const form = new FormData();
  form.append('file', new Blob([await workbook.xlsx.writeBuffer()]), 'import.xlsx');
  const response = await fetch(base + '/excel/import-by-course', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.admin}` },
    body: form,
  });
  assert.equal(response.status, 200);
  const kept = await SinhVien.findOne({ studentCode: 'KEEP00001' });
  assert.equal(kept.phone, '0901111111');
  assert.equal(kept.parentPhone, '0902222222');
  assert.equal(kept.classCode, 'HOMECLASS');
  const created = await SinhVien.findOne({ studentCode: 'NEW000001' });
  assert.equal(created.classCode, 'CD25X');
});

test('excel templates require an admin token', async () => {
  for (const path of ['/excel/course-template', '/excel/export-template']) {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, tokens.teacher)).status, 403);
  }
});

test('reason analytics prefers category and matches whole words only', async () => {
  await NhiemVuGoiDien.deleteMany({});
  const base = {
    studentId: students[0]._id,
    courseGroupId: group._id,
    assignedStaffId: users.admin._id,
    absenceDate: new Date(),
  };
  await NhiemVuGoiDien.create([
    { ...base, callNote: 'các bạn nghỉ hết' },
    { ...base, callNote: 'đi làm ca tối' },
    { ...base, callNote: 'ghi chú bất kỳ', absenceReasonCategory: 'Bệnh/Sức khỏe' },
  ]);
  const { body } = await request('/analytics/summary', tokens.admin);
  const counts = Object.fromEntries(body.reasonStats.map((r) => [r.reason, r.count]));
  assert.equal(counts['Lý do khác'], 1);
  assert.equal(counts['Bận đi làm'], 1);
  assert.equal(counts['Ốm / Sức khỏe'], 1);
});

test('round-robin call task assignment rotates instead of always picking the first staff', async () => {
  const rrGroup = await NhomHocPhan.create({ groupCode: 'RR_GROUP' });
  const rrStudents = await SinhVien.create([
    { studentCode: 'RR000001', fullName: 'RR One', classCode: 'RRCLS' },
    { studentCode: 'RR000002', fullName: 'RR Two', classCode: 'RRCLS' },
  ]);
  rrGroup.students = rrStudents.map((s) => s._id);
  await rrGroup.save();
  await Settings.updateOne({}, { taskAssignmentRule: 'round-robin' }, { upsert: true });

  // Each submission has exactly one absentee, so with the old `index % staff.length`
  // (index always 0) the same staff member would be picked every single time.
  const staffNames = [];
  for (const [i, student] of rrStudents.entries()) {
    const res = await request('/attendance/submit', tokens.admin, 'POST', {
      courseGroupId: String(rrGroup._id),
      absentStudentIds: [String(student._id)],
      date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString(),
    });
    assert.equal(res.status, 201);
    staffNames.push(res.body.taskAssignments[0]?.staffName);
  }
  assert.notEqual(staffNames[0], staffNames[1]);
});

test('deleting staff hands off their open call tasks to the deleting admin', async () => {
  const doomedStaff = await NguoiDung.create({
    fullName: 'Doomed Staff',
    email: 'doomed-staff@example.test',
    password: await bcrypt.hash('x', 4),
    role: 'staff',
  });
  const openTask = await NhiemVuGoiDien.create({
    studentId: students[0]._id,
    courseGroupId: group._id,
    assignedStaffId: doomedStaff._id,
    absenceDate: new Date(),
  });
  const doneTask = await NhiemVuGoiDien.create({
    studentId: students[0]._id,
    courseGroupId: group._id,
    assignedStaffId: doomedStaff._id,
    absenceDate: new Date(),
    status: CALL_STATUS.CONTACTED,
  });

  const response = await request(`/auth/staff/${doomedStaff._id}`, tokens.admin, 'DELETE');
  assert.equal(response.status, 200);
  assert.equal(
    (await NhiemVuGoiDien.findById(openTask._id)).assignedStaffId.toString(),
    users.admin.id,
  );
  // Completed tasks are historical: left pointing at the deleted user, not reassigned.
  assert.equal(
    (await NhiemVuGoiDien.findById(doneTask._id)).assignedStaffId.toString(),
    doomedStaff.id,
  );
});

test('deleting a teacher clears teacherId on their course groups', async () => {
  const doomedTeacher = await NguoiDung.create({
    fullName: 'Doomed Teacher',
    email: 'doomed-teacher@example.test',
    password: await bcrypt.hash('x', 4),
    role: 'teacher',
  });
  const taughtGroup = await NhomHocPhan.create({
    groupCode: 'TAUGHT_GROUP',
    teacherId: doomedTeacher._id,
  });

  const response = await request(`/auth/staff/${doomedTeacher._id}`, tokens.admin, 'DELETE');
  assert.equal(response.status, 200);
  assert.equal((await NhomHocPhan.findById(taughtGroup._id)).teacherId, null);
});

test('deleting a course group cascades to its attendance, call tasks and student enrollment', async () => {
  const doomedStudent = await SinhVien.create({
    studentCode: 'DOOM00001',
    fullName: 'Doomed Student',
    classCode: 'DOOM',
    courseGroups: ['DOOM_GROUP'],
  });
  const doomedGroup = await NhomHocPhan.create({
    groupCode: 'DOOM_GROUP',
    students: [doomedStudent._id],
  });
  const attendance = await DiemDanh.create({
    courseGroupId: doomedGroup._id,
    absentStudents: [doomedStudent._id],
  });
  const task = await NhiemVuGoiDien.create({
    studentId: doomedStudent._id,
    courseGroupId: doomedGroup._id,
    assignedStaffId: users.admin._id,
    absenceDate: new Date(),
  });

  const response = await request(`/course-groups/${doomedGroup._id}`, tokens.admin, 'DELETE');
  assert.equal(response.status, 200);
  assert.equal(await DiemDanh.countDocuments({ _id: attendance._id }), 0);
  assert.equal(await NhiemVuGoiDien.countDocuments({ _id: task._id }), 0);
  assert.ok(!(await SinhVien.findById(doomedStudent._id)).courseGroups.includes('DOOM_GROUP'));
});

// Earlier tests exercise password-reset and status-toggle on users.staff/users.other,
// which bumps tokenVersion and revokes tokens.staff/tokens.other. The task tests need
// their own freshly-signed, never-revoked staff accounts.
async function createTaskStaff(suffix) {
  const password = await bcrypt.hash('task-staff-password', 4);
  const staff = await NguoiDung.create({
    fullName: `Task Staff ${suffix}`,
    email: `task-staff-${suffix}@example.test`,
    password,
    role: 'staff',
  });
  return { staff, token: sign(staff) };
}

test('task creation is admin-only and requires an active staff assignee', async () => {
  const { staff, token } = await createTaskStaff('perm');
  assert.equal(
    (
      await request('/tasks', token, 'POST', {
        title: 'x',
        description: 'y',
        assignedTo: String(staff._id),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/tasks', tokens.admin, 'POST', {
        title: '',
        description: 'y',
        assignedTo: String(staff._id),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/tasks', tokens.admin, 'POST', {
        title: 'x',
        description: 'y',
        assignedTo: String(users.teacher._id), // not a 'staff' role
      })
    ).status,
    400,
  );
});

test('full task lifecycle: assign -> acknowledge -> submit evidence -> approve', async () => {
  const { staff: assignee, token: assigneeToken } = await createTaskStaff('lifecycle-assignee');
  const { token: bystanderToken } = await createTaskStaff('lifecycle-bystander');

  const create = await request('/tasks', tokens.admin, 'POST', {
    title: 'Gọi nhắc học phí học kỳ mới',
    description: 'Gọi cho danh sách sinh viên còn nợ học phí trước ngày 30/09.',
    assignedTo: String(assignee._id),
    dueDate: '2026-12-31',
  });
  assert.equal(create.status, 201);
  assert.equal(create.body.task.status, TASK_STATUS.PENDING);
  const taskId = create.body.task._id;

  // Another staff member cannot act on someone else's task.
  assert.equal((await request(`/tasks/${taskId}/acknowledge`, bystanderToken, 'PUT')).status, 403);
  // The admin who assigned it cannot acknowledge on the assignee's behalf either.
  assert.equal((await request(`/tasks/${taskId}/acknowledge`, tokens.admin, 'PUT')).status, 403);

  const ack = await request(`/tasks/${taskId}/acknowledge`, assigneeToken, 'PUT');
  assert.equal(ack.status, 200);
  assert.equal(ack.body.task.status, TASK_STATUS.ACKNOWLEDGED);

  // Submitting with no note, link or file is rejected.
  assert.equal(
    (
      await fetch(`${base}/tasks/${taskId}/submit`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${assigneeToken}` },
        body: new FormData(),
      })
    ).status,
    400,
  );

  const form = new FormData();
  form.append('note', 'Đã gọi và nhắc nhở đầy đủ danh sách.');
  form.append('link', 'https://drive.example.com/proof');
  form.append('files', new Blob(['fake image bytes'], { type: 'image/png' }), 'proof.png');
  const submitRes = await fetch(`${base}/tasks/${taskId}/submit`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${assigneeToken}` },
    body: form,
  });
  assert.equal(submitRes.status, 200);
  const submitted = await submitRes.json();
  assert.equal(submitted.task.status, TASK_STATUS.SUBMITTED);
  assert.equal(submitted.task.evidenceFiles.length, 1);
  const fileId = submitted.task.evidenceFiles[0]._id;

  // Evidence is only reachable by the admin or the assignee.
  assert.equal((await request(`/tasks/${taskId}/evidence/${fileId}`, bystanderToken)).status, 403);
  const fileRes = await fetch(`${base}/tasks/${taskId}/evidence/${fileId}`, {
    headers: { Authorization: `Bearer ${assigneeToken}` },
  });
  assert.equal(fileRes.status, 200);
  assert.equal(fileRes.headers.get('content-type'), 'image/png');

  // Reject once: the task bounces back for rework.
  const reject = await request(`/tasks/${taskId}/review`, tokens.admin, 'PUT', {
    approve: false,
    reviewNote: 'Thiếu ảnh chụp danh sách đã gọi.',
  });
  assert.equal(reject.status, 200);
  assert.equal(reject.body.task.status, TASK_STATUS.REJECTED);

  const resubmitForm = new FormData();
  resubmitForm.append('note', 'Đã bổ sung ảnh chụp danh sách.');
  const resubmit = await fetch(`${base}/tasks/${taskId}/submit`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${assigneeToken}` },
    body: resubmitForm,
  });
  assert.equal(resubmit.status, 200);
  assert.equal((await resubmit.json()).task.status, TASK_STATUS.SUBMITTED);

  const approve = await request(`/tasks/${taskId}/review`, tokens.admin, 'PUT', { approve: true });
  assert.equal(approve.status, 200);
  assert.equal(approve.body.task.status, TASK_STATUS.COMPLETED);
  assert.ok(approve.body.task.completedAt);

  // Closed tasks no longer count toward the staff member's pending badge.
  const pending = await request('/tasks/pending-count', assigneeToken);
  assert.equal(pending.status, 200);
  assert.equal(pending.body.pendingCount, 0);
});

test('deleting a task removes its evidence files from disk', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { staff, token } = await createTaskStaff('delete-cleanup');
  const create = await request('/tasks', tokens.admin, 'POST', {
    title: 'Nhiệm vụ sẽ bị xóa',
    description: 'Kiểm tra dọn file khi xóa nhiệm vụ.',
    assignedTo: String(staff._id),
  });
  const taskId = create.body.task._id;
  await request(`/tasks/${taskId}/acknowledge`, token, 'PUT');

  const form = new FormData();
  form.append('files', new Blob(['temp'], { type: 'image/png' }), 'temp.png');
  await fetch(`${base}/tasks/${taskId}/submit`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const saved = await NhiemVu.findById(taskId);
  const storedName = saved.evidenceFiles[0].storedName;
  const diskPath = path.join(__dirname, '..', 'uploads', 'tasks', storedName);
  assert.ok(fs.existsSync(diskPath));

  assert.equal((await request(`/tasks/${taskId}`, tokens.admin, 'DELETE')).status, 200);
  assert.ok(!fs.existsSync(diskPath));
});

test('AI call-advice enforces call-task ownership and fails gracefully without a key', async () => {
  const { staff: assignee, token: assigneeToken } = await createTaskStaff('ai-call-advice');
  const { token: bystanderToken } = await createTaskStaff('ai-call-advice-bystander');
  const callTask = await NhiemVuGoiDien.create({
    studentId: students[0]._id,
    courseGroupId: group._id,
    assignedStaffId: assignee._id,
    absenceDate: new Date(),
  });

  assert.equal(
    (
      await request('/ai/call-advice', bystanderToken, 'POST', {
        callTaskId: String(callTask._id),
      })
    ).status,
    403,
  );
  assert.equal(
    (await request('/ai/call-advice', assigneeToken, 'POST', { callTaskId: 'not-an-id' })).status,
    400,
  );
  const ok = await request('/ai/call-advice', assigneeToken, 'POST', {
    callTaskId: String(callTask._id),
  });
  assert.equal(ok.status, 503);
  assert.match(ok.body.message, /ANTHROPIC_API_KEY/);
});

test('AI review-task-evidence is admin-only and requires submitted evidence', async () => {
  const { staff, token } = await createTaskStaff('ai-review');
  const workTask = await NhiemVu.create({
    title: 'x',
    description: 'y',
    assignedBy: users.admin._id,
    assignedTo: staff._id,
  });

  assert.equal(
    (
      await request('/ai/review-task-evidence', token, 'POST', {
        taskId: String(workTask._id),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/ai/review-task-evidence', tokens.admin, 'POST', {
        taskId: String(workTask._id),
      })
    ).status,
    400, // still TASK_STATUS.PENDING — no evidence submitted yet
  );

  workTask.status = TASK_STATUS.SUBMITTED;
  workTask.evidenceNote = 'Đã hoàn thành.';
  await workTask.save();
  const ok = await request('/ai/review-task-evidence', tokens.admin, 'POST', {
    taskId: String(workTask._id),
  });
  assert.equal(ok.status, 503);
});

test('AI chat is admin-only and validates the conversation shape', async () => {
  const { token } = await createTaskStaff('ai-chat');
  assert.equal(
    (
      await request('/ai/chat', token, 'POST', {
        messages: [{ role: 'user', content: 'hi' }],
      })
    ).status,
    403,
  );
  assert.equal((await request('/ai/chat', tokens.admin, 'POST', { messages: [] })).status, 400);
  assert.equal(
    (
      await request('/ai/chat', tokens.admin, 'POST', {
        messages: [{ role: 'system', content: 'x' }],
      })
    ).status,
    400,
  );
  const ok = await request('/ai/chat', tokens.admin, 'POST', {
    messages: [{ role: 'user', content: 'Có bao nhiêu sinh viên trong hệ thống?' }],
  });
  assert.equal(ok.status, 503);
});

test('AI staff-performance is admin-only', async () => {
  const { staff, token } = await createTaskStaff('ai-perf');
  assert.equal(
    (
      await request('/ai/staff-performance', token, 'POST', {
        staffId: String(staff._id),
      })
    ).status,
    403,
  );
  const ok = await request('/ai/staff-performance', tokens.admin, 'POST', {
    staffId: String(staff._id),
  });
  assert.equal(ok.status, 503);
});

// Runs `fn` with PayOS "configured" and its HTTP API faked; other fetches (our own server) pass through.
async function withFakePayOS(paymentStatus, fn) {
  const realFetch = globalThis.fetch;
  const payosCalls = [];
  Object.assign(process.env, {
    PAYOS_CLIENT_ID: 'client',
    PAYOS_API_KEY: 'api-key',
    PAYOS_CHECKSUM_KEY: 'checksum-key',
  });
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).startsWith('https://api-merchant.payos.vn')) return realFetch(url, init);
    const body = init.body ? JSON.parse(init.body) : undefined;
    payosCalls.push({ method: init.method, url: String(url), body });
    const data =
      init.method === 'POST'
        ? { checkoutUrl: `https://pay.payos.vn/web/${body.orderCode}`, paymentLinkId: 'link-1' }
        : {
            status: paymentStatus.value,
            amount: paymentStatus.amount,
            amountPaid: paymentStatus.amount,
          };
    return new Response(JSON.stringify({ code: '00', desc: 'success', data }));
  };
  try {
    await fn(payosCalls);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.PAYOS_CLIENT_ID;
    delete process.env.PAYOS_API_KEY;
    delete process.env.PAYOS_CHECKSUM_KEY;
  }
}
const signedWebhook = (data, key = 'checksum-key') => ({
  code: '00',
  desc: 'success',
  success: true,
  data,
  signature: payosService.hmac(key, payosService.canonicalize(data)),
});

test('PayOS: admin buys a plan, signed webhook extends the subscription exactly once', async () => {
  const status = { value: 'PENDING', amount: 0 };
  await withFakePayOS(status, async (payosCalls) => {
    assert.equal(
      (await request('/billing/orders', tokens.teacher, 'POST', { planCode: 'goi_1_thang' }))
        .status,
      403,
    );
    assert.equal(
      (await request('/billing/orders', tokens.admin, 'POST', { planCode: 'khong-co' })).status,
      400,
    );

    const before = (await request('/billing/status', tokens.admin)).body;
    const created = await request('/billing/orders', tokens.admin, 'POST', {
      planCode: 'goi_1_thang',
    });
    assert.equal(created.status, 201);
    assert.match(created.body.checkoutUrl, /^https:\/\/pay\.payos\.vn\//);

    // The create request is signed over exactly these five fields, in this order.
    const sent = payosCalls.find((c) => c.method === 'POST').body;
    assert.equal(sent.amount, 499000);
    assert.ok(sent.description.length <= 25);
    assert.equal(
      sent.signature,
      payosService.hmac(
        'checksum-key',
        `amount=${sent.amount}&cancelUrl=${sent.cancelUrl}&description=${sent.description}&orderCode=${sent.orderCode}&returnUrl=${sent.returnUrl}`,
      ),
    );

    const orderCode = created.body.orderCode;
    const paid = { orderCode, amount: 499000, code: '00', desc: 'ok', reference: 'FT123' };
    // Forged (wrong key) and tampered webhooks are rejected and change nothing.
    assert.equal(
      (await request('/billing/payos-webhook', null, 'POST', signedWebhook(paid, 'wrong'))).status,
      400,
    );
    const tampered = signedWebhook(paid);
    tampered.data = { ...paid, amount: 1000 };
    assert.equal((await request('/billing/payos-webhook', null, 'POST', tampered)).status, 400);
    assert.equal((await DonThanhToan.findOne({ orderCode })).status, 'cho_thanh_toan');

    // Genuine webhook, delivered twice (PayOS retries): extends by one month only once.
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await request('/billing/payos-webhook', null, 'POST', signedWebhook(paid))).status,
        200,
      );
    const order = await DonThanhToan.findOne({ orderCode });
    assert.equal(order.status, 'da_thanh_toan');
    assert.equal(order.reference, 'FT123');
    const after = (await request('/billing/status', tokens.admin)).body;
    const gainedDays = (new Date(after.expiresAt) - new Date(before.expiresAt)) / 86400000;
    assert.ok(gainedDays >= 28 && gainedDays <= 31, `extended by ${gainedDays} days`);
    assert.equal(after.plan, 'goi_1_thang');

    // A later sync of the same order must not extend again.
    status.value = 'PAID';
    status.amount = 499000;
    const synced = await request(`/billing/orders/${orderCode}/sync`, tokens.admin, 'POST');
    assert.equal(synced.status, 200);
    assert.equal(synced.body.subscription.expiresAt, after.expiresAt);

    // PayOS's "confirm webhook" test call references an unknown order: acknowledged, ignored.
    const ping = signedWebhook({ orderCode: 123, amount: 3000, code: '00', desc: 'ok' });
    assert.equal((await request('/billing/payos-webhook', null, 'POST', ping)).status, 200);
  });
});

test('PayOS: return-page sync marks a paid order even without a webhook', async () => {
  const status = { value: 'PENDING', amount: 2690000 };
  await withFakePayOS(status, async () => {
    const created = await request('/billing/orders', tokens.admin, 'POST', {
      planCode: 'goi_6_thang',
    });
    const path = `/billing/orders/${created.body.orderCode}/sync`;
    assert.equal((await request(path, tokens.admin, 'POST')).body.order.status, 'cho_thanh_toan');
    status.value = 'PAID';
    const synced = await request(path, tokens.admin, 'POST');
    assert.equal(synced.body.order.status, 'da_thanh_toan');
    assert.equal(synced.body.subscription.plan, 'goi_6_thang');
  });
});

test('expired subscription locks business APIs but keeps login and billing open', async () => {
  const settings = await Settings.findOne();
  const original = settings.subscriptionExpiresAt;
  await Settings.updateOne({}, { subscriptionExpiresAt: new Date(Date.now() - 1000) });
  try {
    const status = await request('/billing/status', tokens.teacher); // also refreshes the cache
    assert.equal(status.status, 200);
    assert.equal(status.body.active, false);
    const locked = await request('/attendance/course-groups', tokens.teacher);
    assert.equal(locked.status, 402);
    assert.equal(locked.body.code, 'SUBSCRIPTION_EXPIRED');
    assert.equal((await request('/billing/orders', tokens.admin)).status, 200);
    assert.equal((await request('/settings', tokens.admin)).status, 200);
  } finally {
    await Settings.updateOne({}, { subscriptionExpiresAt: original });
    await request('/billing/status', tokens.admin);
  }
  assert.equal((await request('/attendance/course-groups', tokens.teacher)).status, 200);
});

// A staff account of our own: earlier tests delete/revoke the shared 'staff' and 'other' ones.
async function ensureCskh() {
  if (users.cskh) return;
  users.cskh = await NguoiDung.create({
    fullName: 'cskh',
    email: 'cskh@example.test',
    password: await bcrypt.hash('test-password', 4),
    role: 'staff',
  });
  tokens.cskh = sign(users.cskh);
}

test('manager (Trưởng phòng/PHT): student records, call overview and task assignment, not system config', async () => {
  await ensureCskh();
  const token = tokens.manager;
  const students = await request('/students?search=TEST', token);
  assert.equal(students.status, 200);
  assert.equal(students.body.total, 2);
  assert.equal(
    (await request(`/call-tasks/student-360/${students.body.items[0]._id}`, token)).status,
    200,
  );
  assert.equal((await request('/call-tasks/admin-all', token)).status, 200);
  assert.equal((await request('/tasks/admin-all', token)).status, 200);
  assert.equal((await request('/analytics/summary', token)).status, 200);

  const task = await request('/tasks', token, 'POST', {
    title: 'Việc do trưởng phòng giao',
    description: 'Liên hệ sinh viên vắng nhiều',
    assignedTo: String(users.cskh._id),
  });
  assert.equal(task.status, 201);
  assert.equal(
    String(task.body.task.assignedBy._id || task.body.task.assignedBy),
    String(users.manager._id),
  );
  await NhiemVu.deleteOne({ _id: task.body.task._id });

  // System administration stays with the admin.
  for (const [path, method] of [
    ['/course-groups', 'GET'],
    ['/auth/class-assignments', 'GET'],
    ['/billing/orders', 'GET'],
    ['/settings', 'PUT'],
    ['/auth/create-staff', 'POST'],
  ])
    assert.equal(
      (await request(path, token, method, method === 'GET' ? undefined : {})).status,
      403,
      path,
    );
  // Teachers and staff cannot browse every student.
  assert.equal((await request('/students', tokens.teacher)).status, 403);
  assert.equal((await request('/students', tokens.cskh)).status, 403);
});

test('admin can create a manager account; timetable is readable by every role without student data', async () => {
  await ensureCskh();
  const created = await request('/auth/create-staff', tokens.admin, 'POST', {
    fullName: 'Phó hiệu trưởng',
    email: 'pht@itc.edu.vn',
    role: 'manager',
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.staff.role, 'manager');
  await NguoiDung.deleteOne({ _id: created.body.staff.id });

  for (const role of ['teacher', 'cskh', 'manager']) {
    const timetable = await request('/course-groups/timetable', tokens[role]);
    assert.equal(timetable.status, 200, role);
    assert.ok(timetable.body.length >= 2);
    assert.equal(timetable.body[0].students, undefined); // no personal data
  }
  const mine = (await request('/course-groups/timetable', tokens.teacher)).body.filter(
    (g) => g.isMine,
  );
  const mineCodes = mine.map((g) => g.groupCode);
  assert.ok(mineCodes.includes('TEST-GROUP'));
  assert.ok(!mineCodes.includes('OTHER-GROUP'));
  // Staff cannot take attendance.
  assert.equal(
    (
      await request('/attendance/submit', tokens.cskh, 'POST', {
        courseGroupId: String(group._id),
        absentStudentIds: [],
      })
    ).status,
    403,
  );
});

test('calls: teacher calls own students, the call is logged, a recording can be attached and played', async () => {
  await ensureCskh();
  await SinhVien.updateOne(
    { _id: students[0]._id },
    { phone: '0912345678', parentPhone: '0987654321' },
  );

  // Teacher may only call students of the course group they teach.
  assert.equal(
    (
      await request('/calls', tokens.teacher, 'POST', {
        studentId: String(students[1]._id),
        target: 'sinh_vien',
        method: 'dien_thoai',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/calls', tokens.teacher, 'POST', {
        studentId: String(students[0]._id),
        target: 'sinh_vien',
        method: 'stringee',
      })
    ).status,
    503, // switchboard not configured in tests
  );
  const started = await request('/calls', tokens.teacher, 'POST', {
    studentId: String(students[0]._id),
    target: 'phu_huynh',
    method: 'dien_thoai',
    courseGroupId: String(group._id),
  });
  assert.equal(started.status, 201);
  assert.equal(started.body.phoneNumber, '0987654321');
  const callId = started.body.call._id;

  // Only the caller may finish it.
  assert.equal(
    (await request(`/calls/${callId}/end`, tokens.manager, 'PUT', { outcome: 'nghe_may' })).status,
    403,
  );
  const ended = await request(`/calls/${callId}/end`, tokens.teacher, 'PUT', {
    outcome: 'nghe_may',
    note: 'Phụ huynh xác nhận con bị ốm',
    durationSec: 95,
  });
  assert.equal(ended.status, 200);
  assert.equal(ended.body.call.status, 'ket_thuc');
  assert.equal(ended.body.call.durationSec, 95);

  const uploadAs = (token, type, bytes = 'ID3fake-mp3-bytes') => {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), 'ghi-am.mp3');
    return fetch(`${base}/calls/${callId}/recording`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  };
  assert.equal((await uploadAs(tokens.teacher, 'application/pdf')).status, 400);
  assert.equal((await uploadAs(tokens.cskh, 'audio/mpeg')).status, 403);
  assert.equal((await uploadAs(tokens.teacher, 'audio/mpeg')).status, 200);

  const play = (token) =>
    fetch(`${base}/calls/${callId}/recording`, { headers: { Authorization: `Bearer ${token}` } });
  const asTeacher = await play(tokens.teacher);
  assert.equal(asTeacher.status, 200);
  assert.equal(asTeacher.headers.get('content-type'), 'audio/mpeg');
  assert.equal(await asTeacher.text(), 'ID3fake-mp3-bytes');
  assert.equal((await play(tokens.manager)).status, 200);
  assert.equal((await play(tokens.cskh)).status, 403);

  // History: callers see their own calls, management sees everyone's.
  const own = await request('/calls', tokens.teacher);
  assert.ok(own.body.items.some((c) => c._id === callId));
  assert.equal((await request('/calls', tokens.cskh)).body.items.length, 0);
  const all = await request(`/calls?studentId=${students[0]._id}`, tokens.manager);
  assert.equal(all.body.items[0]._id, callId);
  assert.equal(all.body.items[0].callerId.fullName, 'teacher');

  const saved = await CuocGoi.findById(callId);
  await fs.promises.unlink(
    path.join(__dirname, '..', 'uploads', 'recordings', saved.recording.storedName),
  );
  await CuocGoi.deleteOne({ _id: callId });
});

test('calls via Stringee: client token, and answer_url only connects a matching fresh call log', async () => {
  Object.assign(process.env, {
    STRINGEE_KEY_SID: 'SK_test',
    STRINGEE_KEY_SECRET: 'stringee-secret',
    STRINGEE_HOTLINE: '02873001234',
  });
  try {
    const started = await request('/calls', tokens.manager, 'POST', {
      studentId: String(students[0]._id),
      target: 'sinh_vien',
      method: 'stringee',
    });
    assert.equal(started.status, 201);
    const { accessToken, from, to } = started.body.stringee;
    assert.equal(from, '842873001234');
    assert.equal(to, '84912345678');
    const decoded = jwt.verify(accessToken, 'stringee-secret', { complete: true });
    assert.equal(decoded.header.cty, 'stringee-api;v=1');
    assert.equal(decoded.payload.userId, String(users.manager._id));

    const answer = (params) =>
      fetch(`${base}/calls/stringee/answer?${new URLSearchParams(params)}`).then((r) => r.json());
    const custom = JSON.stringify({ callLogId: started.body.call._id });
    // Wrong user or wrong number → empty SCCO (Stringee hangs up).
    assert.deepEqual(
      await answer({ userId: String(users.teacher._id), to: to, custom, callId: 'c1' }),
      [],
    );
    assert.deepEqual(
      await answer({ userId: String(users.manager._id), to: '84999999999', custom }),
      [],
    );
    const scco = await answer({
      userId: String(users.manager._id),
      to,
      custom,
      callId: 'call-abc',
    });
    assert.equal(scco[0].action, 'record');
    assert.equal(scco[1].action, 'connect');
    assert.equal(scco[1].to.number, '84912345678');
    assert.equal(scco[1].from.number, '842873001234');
    assert.equal((await CuocGoi.findById(started.body.call._id)).stringeeCallId, 'call-abc');
    await CuocGoi.deleteOne({ _id: started.body.call._id });
  } finally {
    delete process.env.STRINGEE_KEY_SID;
    delete process.env.STRINGEE_KEY_SECRET;
    delete process.env.STRINGEE_HOTLINE;
  }
});

test('unknown API routes return JSON and malformed JSON uses the error handler', async () => {
  const missing = await request('/does-not-exist');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.message, 'API not found');
  const malformed = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.status, 400);
  assert.equal(typeof (await malformed.json()).message, 'string');
});

test('configuration rejects missing secrets and production demo mode', () => {
  const oldSecret = process.env.JWT_SECRET;
  const oldNodeEnv = process.env.NODE_ENV;
  const oldMemory = process.env.USE_MEMORY_DB;
  try {
    delete process.env.JWT_SECRET;
    assert.throws(getConfig, /JWT_SECRET/);
    process.env.JWT_SECRET = oldSecret;
    process.env.NODE_ENV = 'production';
    process.env.USE_MEMORY_DB = 'true';
    assert.throws(getConfig, /disabled in production/);
    assert.ok(dateKey('2026-09-09') < dateKey('2026-10-01'));
  } finally {
    process.env.JWT_SECRET = oldSecret;
    process.env.NODE_ENV = oldNodeEnv;
    if (oldMemory === undefined) delete process.env.USE_MEMORY_DB;
    else process.env.USE_MEMORY_DB = oldMemory;
  }
});
