const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-test-secret-with-at-least-32-characters';
// AI routes must fail gracefully (503) rather than call a real API in tests.
delete process.env.OPENAI_API_KEY;
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
  // Scheduled every day, all day, so the teacher's attendance window is open whenever tests run.
  group = await NhomHocPhan.create({
    groupCode: 'TEST-GROUP',
    teacherId: users.teacher._id,
    students: [students[0]._id],
    scheduleDays: ['thu_2', 'thu_3', 'thu_4', 'thu_5', 'thu_6', 'thu_7', 'chu_nhat'],
    startTime: '00:00',
    endTime: '23:59',
  });
  // Class TEST is cared for by users.staff; class OTHER has nobody (manager queue).
  await require('../services/dichVuPhanCongLop').assignClass({
    classCode: 'TEST',
    staffId: users.staff._id,
    by: users.manager._id,
  });
  users.staff = await NguoiDung.findById(users.staff._id);
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
  for (const path of ['/call-tasks/admin-all', '/course-groups', '/class-assignments']) {
    assert.equal((await request(path, tokens.staff)).status, 403, path);
  }
  // Staff may read reports (their own classes); teachers may not.
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
  assert.equal((await request('/attendance/history/not-an-id', tokens.manager)).status, 400);
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
  ])
    assert.equal(
      (await request('/attendance/submit', tokens.teacher, 'POST', { ...valid, ...changes }))
        .status,
      400,
    );
  // Only attendance.override may choose a date, and it must be valid.
  assert.equal(
    (await request('/attendance/submit', tokens.manager, 'POST', { ...valid, date: 'invalid' }))
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
  // Back-dated attendance needs attendance.override (Trưởng phòng); the teacher's date is ignored.
  const result = await request('/attendance/submit', tokens.manager, 'POST', payload);
  assert.equal(result.status, 201);
  assert.equal(result.body.attendance.recordedBy, String(users.manager._id));
  for (const response of await Promise.all([
    request('/attendance/submit', tokens.manager, 'POST', payload),
    request('/attendance/submit', tokens.manager, 'POST', payload),
  ]))
    assert.equal(response.status, 200);
  assert.equal(await DiemDanh.countDocuments(), 1);
  assert.equal(await NhiemVuGoiDien.countDocuments(), 1);
  const task = await NhiemVuGoiDien.findOne();
  assert.equal(dateKey(task.absenceDate), '2026-01-12');
  // Student A's class TEST is assigned to users.staff, so the call goes to them.
  assert.equal(String(task.assignedStaffId), String(users.staff._id));
});
test('task ownership prevents modifying another staff task or student profile', async () => {
  const task = await NhiemVuGoiDien.findOne();
  assert.equal(
    (
      await request(`/call-tasks/${task._id}/update`, tokens.other, 'PUT', {
        status: CALL_STATUS.CONTACTED,
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(`/call-tasks/student-360/${students[0]._id}`, tokens.other)).status,
    403,
  );
  assert.equal(
    (
      await request(`/call-tasks/student-tags/${students[0]._id}`, tokens.other, 'PUT', {
        tags: ['x'],
      })
    ).status,
    403,
  );
  // The admin only views business data: no call updates, no tag edits.
  assert.equal(
    (await request(`/call-tasks/${task._id}/update`, tokens.admin, 'PUT', { status: 'contacted' }))
      .status,
    403,
  );
  assert.equal(
    (
      await request(`/call-tasks/student-tags/${students[0]._id}`, tokens.admin, 'PUT', {
        tags: ['x'],
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(`/call-tasks/${task._id}/update`, tokens.staff, 'PUT', { status: 'invalid' }))
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
  // A past record is outside the teacher's same-day window.
  assert.equal(
    (
      await request(`/attendance/history/${record._id}`, tokens.teacher, 'PUT', {
        absentStudentIds: [],
      })
    ).status,
    403,
  );
  // The admin cannot write attendance either.
  assert.equal(
    (
      await request(`/attendance/history/${record._id}`, tokens.admin, 'PUT', {
        absentStudentIds: [],
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/attendance/history/${record._id}`, tokens.manager, 'PUT', {
        absentStudentIds: [],
      })
    ).status,
    200,
  );
  assert.equal(await NhiemVuGoiDien.countDocuments(), 0);
});
test('absences of a class without a responsible staff member go to the manager queue', async () => {
  const result = await request('/attendance/submit', tokens.manager, 'POST', {
    courseGroupId: String(otherGroup._id),
    absentStudentIds: [String(students[1]._id)],
    date: '2026-01-13T12:00:00',
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.taskAssignments[0].unassigned, true);
  const task = await NhiemVuGoiDien.findOne({ studentId: students[1]._id });
  assert.equal(task.assignedStaffId, null);
  const queue = await request('/call-tasks/admin-all?assignedTo=unassigned', tokens.manager);
  assert.deepEqual(
    queue.body.map((t) => t._id),
    [String(task._id)],
  );
  // The manager hands the queued call to a staff member.
  assert.equal(
    (
      await request(`/call-tasks/${task._id}/assign`, tokens.staff, 'PUT', {
        staffId: String(users.other._id),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/call-tasks/${task._id}/assign`, tokens.manager, 'PUT', {
        staffId: String(users.other._id),
      })
    ).status,
    200,
  );
  assert.equal(
    String((await NhiemVuGoiDien.findById(task._id)).assignedStaffId),
    String(users.other._id),
  );
  assert.equal(
    (await request(`/attendance/history/${result.body.attendance._id}`, tokens.manager, 'DELETE'))
      .status,
    200,
  );
  assert.equal(await NhiemVuGoiDien.countDocuments(), 0);
});
test('warning levels are configured by the manager and validated', async () => {
  const levels = [
    { name: 'Nhắc nhở', unit: 'periods', threshold: 4, color: '#eab308' },
    { name: 'Cấm thi', unit: 'percent', threshold: 20, color: '#dc2626', examBan: true },
  ];
  for (const token of [tokens.admin, tokens.staff, tokens.teacher])
    assert.equal(
      (await request('/settings/care', token, 'PUT', { warningLevels: levels })).status,
      403,
    );
  for (const bad of [
    [],
    [{ ...levels[0], color: 'red' }],
    [{ ...levels[0], unit: 'days' }],
    [{ ...levels[1], threshold: 150 }],
    [levels[0], { ...levels[0] }],
  ])
    assert.equal(
      (await request('/settings/care', tokens.manager, 'PUT', { warningLevels: bad })).status,
      400,
    );
  const saved = await request('/settings/care', tokens.manager, 'PUT', { warningLevels: levels });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.settings.warningLevels.length, 2);
  assert.equal((await request('/settings', tokens.teacher)).body.warningLevels[1].examBan, true);
  // System settings stay with the admin; bad values are rejected, not silently defaulted.
  assert.equal(
    (await request('/settings', tokens.manager, 'PUT', { systemTitle: 'X' })).status,
    403,
  );
  assert.equal(
    (await request('/settings', tokens.admin, 'PUT', { primaryColor: 'blue' })).status,
    400,
  );
  // Restore defaults for the following tests.
  await Settings.updateOne({}, { $unset: { warningLevels: 1 } });
  require('../services/dichVuCanhBao').clearWarningCache();
});
test('attendance window: only on class days, from class time, editable until end of day', () => {
  const { attendanceWindow, periodInfo, evaluate } = require('../services/dichVuCanhBao');
  // Mondays 07:00–11:30, 1 Jun – 31 Jul 2026.
  const g = {
    shift: 'sang',
    scheduleDays: ['thu_2'],
    startTime: '07:00',
    endTime: '11:30',
    startDate: new Date(2026, 5, 1, 12),
    endDate: new Date(2026, 6, 31, 12),
    periodsPerSession: 5,
  };
  const at = (d, h, m) => new Date(2026, 5, d, h, m);
  assert.equal(attendanceWindow(g, { now: at(2, 8, 0) }).open, false); // Tuesday: no class
  assert.equal(attendanceWindow(g, { now: at(1, 6, 40) }).open, false); // too early
  assert.equal(attendanceWindow(g, { now: at(1, 6, 50) }).open, true); // 10 minutes early
  assert.equal(attendanceWindow(g, { now: at(1, 9, 0) }).open, true);
  assert.equal(attendanceWindow(g, { now: at(1, 13, 0) }).open, false); // class over, never taken
  assert.equal(attendanceWindow(g, { now: at(1, 22, 0), hasRecordToday: true }).open, true);
  assert.equal(
    attendanceWindow({ ...g, endDate: new Date(2026, 4, 1) }, { now: at(1, 9, 0) }).open,
    false,
  );

  // 9 Mondays x 5 periods = 45 periods; each absence is 5 periods.
  const info = periodInfo(g);
  assert.deepEqual(info, { periodsPerSession: 5, totalPeriods: 45 });
  const levels = [
    { name: 'Nhắc nhở', unit: 'periods', threshold: 5, color: '#eab308', examBan: false },
    { name: 'Cấm thi', unit: 'percent', threshold: 20, color: '#dc2626', examBan: true },
  ];
  assert.equal(evaluate(0, info, levels).warningLevel, null);
  assert.equal(evaluate(1, info, levels).warningLevel.name, 'Nhắc nhở');
  const banned = evaluate(2, info, levels); // 10 periods = 22.2 %
  assert.equal(banned.absentPeriods, 10);
  assert.equal(banned.absentPercent, 22.2);
  assert.equal(banned.warningLevel.name, 'Cấm thi');
  assert.equal(banned.isAtRisk, true);
});

test('teachers cannot take attendance outside the timetable', async () => {
  const closed = await NhomHocPhan.create({
    groupCode: 'CLOSED-GROUP',
    teacherId: users.teacher._id,
    students: [students[0]._id],
    scheduleDays: ['thu_2'],
    startDate: new Date(2020, 0, 6),
    endDate: new Date(2020, 0, 13),
  });
  const window = await request(`/attendance/window/${closed._id}`, tokens.teacher);
  assert.equal(window.status, 200);
  assert.equal(window.body.open, false);
  const denied = await request('/attendance/submit', tokens.teacher, 'POST', {
    courseGroupId: String(closed._id),
    absentStudentIds: [],
  });
  assert.equal(denied.status, 403);
  assert.match(denied.body.message, /lịch học/);
  // The manager's override is not bound to the timetable.
  assert.equal((await request(`/attendance/window/${closed._id}`, tokens.manager)).body.open, true);
  await NhomHocPhan.deleteOne({ _id: closed._id });
});

test('API keys are admin-only, stored encrypted and never returned in clear', async () => {
  assert.equal((await request('/settings/integrations', tokens.manager)).status, 403);
  const saved = await request('/settings/integrations', tokens.admin, 'PUT', {
    values: { STRINGEE_KEY_SECRET: 'super-secret-value-123', STRINGEE_HOTLINE: '0901234567' },
  });
  assert.equal(saved.status, 200);
  const secret = saved.body.items.find((i) => i.key === 'STRINGEE_KEY_SECRET');
  assert.equal(secret.source, 'database');
  assert.ok(!secret.value.includes('super-secret'));
  assert.equal(saved.body.items.find((i) => i.key === 'STRINGEE_HOTLINE').value, '0901234567');
  assert.equal(process.env.STRINGEE_KEY_SECRET, 'super-secret-value-123');
  const stored = (await Settings.findOne().lean()).integrations.STRINGEE_KEY_SECRET;
  assert.ok(!stored.includes('super-secret'));
  // Settings never leak the encrypted blob either.
  assert.equal((await request('/settings', tokens.admin)).body.integrations, undefined);
  assert.equal(
    (await request('/settings/integrations', tokens.admin, 'PUT', { values: { NOPE: 'x' } }))
      .status,
    400,
  );
  // Clearing falls back to .env (unset in tests).
  await request('/settings/integrations', tokens.admin, 'PUT', {
    values: { STRINGEE_KEY_SECRET: '', STRINGEE_HOTLINE: '' },
  });
  assert.equal(process.env.STRINGEE_KEY_SECRET, undefined);
  // Branding is public (login page) and admin-editable.
  assert.equal(
    (
      await request('/settings', tokens.admin, 'PUT', {
        systemTitle: 'ITC CARE',
        primaryColor: '#123456',
      })
    ).status,
    200,
  );
  assert.equal((await request('/settings/branding')).body.primaryColor, '#123456');
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
  assert.equal(
    (
      await request(`/attendance/history/${records[0]._id}`, tokens.teacher, 'PUT', {
        absentStudentIds: [],
      })
    ).status,
    403,
  );
  const updated = await request(`/attendance/history/${records[0]._id}`, tokens.manager, 'PUT', {
    absentStudentIds: [],
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.attendance.recordedBy.email, users.manager.email);
  assert.equal(updated.body.attendance.recordedBy.password, undefined);
  assert.equal(updated.body.attendance.recordedBy.tokenVersion, undefined);
  const fallback = await request(`/attendance/schedule/${group._id}`, tokens.teacher);
  assert.equal(fallback.status, 200);
  assert.equal(fallback.body.hasDates, false);
  assert.ok(fallback.body.sessions.every((item) => item.status === 'recorded'));
});

test('call updates accept every schema status and reject invalid values without saving', async () => {
  const { staff: caller, token: callerToken } = await createTaskStaff('call-status');
  const task = await NhiemVuGoiDien.create({
    studentId: students[0]._id,
    courseGroupId: group._id,
    assignedStaffId: caller._id,
    absenceDate: new Date(),
  });
  for (const status of CALL_STATUSES) {
    const response = await request(`/call-tasks/${task._id}/update`, callerToken, 'PUT', {
      status,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.task.callStatus, status);
  }
  const invalid = await request(`/call-tasks/${task._id}/update`, callerToken, 'PUT', {
    status: 'Ch?a g?i',
  });
  assert.equal(invalid.status, 400);
  const saved = await NhiemVuGoiDien.findById(task._id);
  assert.equal(saved.status, CALL_STATUS.CONTACTED);
  // PENDING -> PENDING is not a call; UNREACHABLE and CONTACTED each count once.
  assert.equal(saved.callAttempts, CALL_STATUSES.length - 1);

  const noteOnly = await request(`/call-tasks/${task._id}/update`, callerToken, 'PUT', {
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
    headers: { Authorization: `Bearer ${tokens.manager}` },
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

test('call tasks follow the administrative class; transfers move open calls and keep history', async () => {
  const { staff: first } = await createTaskStaff('class-first');
  const { staff: second, token: secondToken } = await createTaskStaff('class-second');
  const ccGroup = await NhomHocPhan.create({ groupCode: 'CC_GROUP' });
  const ccStudents = await SinhVien.create([
    { studentCode: 'CC000001', fullName: 'CC One', classCode: 'CCCLS' },
    { studentCode: 'CC000002', fullName: 'CC Two', classCode: 'CCCLS' },
  ]);
  ccGroup.students = ccStudents.map((s) => s._id);
  await ccGroup.save();

  // Only the manager assigns classes.
  assert.equal(
    (await request('/class-assignments/CCCLS', tokens.admin, 'PUT', { staffId: String(first._id) }))
      .status,
    403,
  );
  const assigned = await request('/class-assignments/CCCLS', tokens.manager, 'PUT', {
    staffId: String(first._id),
  });
  assert.equal(assigned.status, 200);

  for (const [i, student] of ccStudents.entries()) {
    const res = await request('/attendance/submit', tokens.manager, 'POST', {
      courseGroupId: String(ccGroup._id),
      absentStudentIds: [String(student._id)],
      date: new Date(2025, 5, 2 + i, 12).toISOString(),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.taskAssignments[0].staffName, first.fullName);
  }
  // The second staff member cannot see this class yet.
  assert.equal(
    (await request(`/call-tasks/student-360/${ccStudents[0]._id}`, secondToken)).status,
    403,
  );

  const transfer = await request('/class-assignments/transfer', tokens.manager, 'POST', {
    fromStaffId: String(first._id),
    toStaffId: String(second._id),
  });
  assert.equal(transfer.status, 200);
  assert.equal(transfer.body.reassignedTaskCount, 2);
  assert.equal(
    await NhiemVuGoiDien.countDocuments({
      studentId: { $in: ccStudents.map((s) => s._id) },
      assignedStaffId: second._id,
    }),
    2,
  );
  assert.equal(
    (await request(`/call-tasks/student-360/${ccStudents[0]._id}`, secondToken)).status,
    200,
  );

  // History keeps both periods; exactly one assignment is active.
  const history = await request('/class-assignments/history?classCode=cccls', tokens.manager);
  assert.equal(history.status, 200);
  assert.equal(history.body.length, 2);
  assert.equal(history.body.filter((h) => h.active).length, 1);
  assert.equal(String(history.body.find((h) => h.active).staffId), String(second._id));
  assert.ok(history.body.find((h) => !h.active).endedAt);

  const overview = await request('/class-assignments', tokens.manager);
  assert.equal(
    overview.body.classes.find((c) => c.classCode === 'CCCLS').staff.fullName,
    second.fullName,
  );
  // The admin may look but not change.
  assert.equal((await request('/class-assignments', tokens.admin)).status, 200);
});

test('deleting staff releases their classes (history kept) and sends open calls to the queue', async () => {
  const doomedStaff = await NguoiDung.create({
    fullName: 'Doomed Staff',
    email: 'doomed-staff@example.test',
    password: await bcrypt.hash('x', 4),
    role: 'staff',
  });
  await request('/class-assignments/DOOMCLS', tokens.manager, 'PUT', {
    staffId: String(doomedStaff._id),
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
  assert.equal((await NhiemVuGoiDien.findById(openTask._id)).assignedStaffId, null);
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

  const response = await request(`/course-groups/${doomedGroup._id}`, tokens.manager, 'DELETE');
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
      await request('/tasks', tokens.manager, 'POST', {
        title: '',
        description: 'y',
        assignedTo: String(staff._id),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/tasks', tokens.manager, 'POST', {
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

  const create = await request('/tasks', tokens.manager, 'POST', {
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
  // The manager who assigned it cannot acknowledge on the assignee's behalf either, and the
  // admin (system administration only) cannot manage tasks at all.
  assert.equal((await request(`/tasks/${taskId}/acknowledge`, tokens.manager, 'PUT')).status, 403);
  assert.equal(
    (await request(`/tasks/${taskId}/review`, tokens.admin, 'PUT', { approve: true })).status,
    403,
  );

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
  const reject = await request(`/tasks/${taskId}/review`, tokens.manager, 'PUT', {
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

  const approve = await request(`/tasks/${taskId}/review`, tokens.manager, 'PUT', {
    approve: true,
  });
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
  const create = await request('/tasks', tokens.manager, 'POST', {
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

  assert.equal((await request(`/tasks/${taskId}`, tokens.manager, 'DELETE')).status, 200);
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
  assert.match(ok.body.message, /API key/);
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
      await request('/ai/review-task-evidence', tokens.manager, 'POST', {
        taskId: String(workTask._id),
      })
    ).status,
    400, // still TASK_STATUS.PENDING — no evidence submitted yet
  );

  workTask.status = TASK_STATUS.SUBMITTED;
  workTask.evidenceNote = 'Đã hoàn thành.';
  await workTask.save();
  const ok = await request('/ai/review-task-evidence', tokens.manager, 'POST', {
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

test('AI Care: every role gets its own tools, and each tool stays within the caller scope', async () => {
  await ensureCskh();
  const aiCare = require('../services/dichVuAiCare');
  const { permissionsForRole } = require('../services/dichVuPhanQuyen');
  const asUser = async (key) => ({
    ...users[key].toObject(),
    id: String(users[key]._id),
    permissions: await permissionsForRole(users[key].role),
  });
  const toolNames = async (key) => aiCare.toolDefinitions(await asUser(key)).map((t) => t.name);

  const profiles = {};
  for (const key of ['admin', 'manager', 'cskh', 'teacher']) {
    const res = await request('/ai/care', tokens[key]);
    assert.equal(res.status, 200, key);
    assert.equal(res.body.name, 'AI Care');
    assert.ok(res.body.suggestions.length > 0);
    profiles[key] = res.body;
  }
  assert.notDeepEqual(profiles.teacher.capabilities, profiles.cskh.capabilities);

  const teacherTools = await toolNames('teacher');
  assert.ok(teacherTools.includes('hoc_phan_cua_toi'));
  assert.ok(!teacherTools.includes('tong_quan_he_thong'));
  assert.ok(!teacherTools.includes('nhiem_vu_goi_dien_cua_toi'));
  const staffTools = await toolNames('cskh');
  assert.ok(staffTools.includes('nhiem_vu_goi_dien_cua_toi'));
  assert.ok(!staffTools.includes('khoi_luong_nhan_vien'));
  const managerTools = await toolNames('manager');
  assert.ok(managerTools.includes('khoi_luong_nhan_vien'));
  assert.ok(!managerTools.includes('goi_dich_vu'));
  assert.ok((await toolNames('admin')).includes('goi_dich_vu'));
  assert.ok((await toolNames('admin')).includes('cau_hinh_ket_noi'));
  assert.ok(!managerTools.includes('cau_hinh_ket_noi'));
  assert.ok(managerTools.includes('phan_cong_lop'));
  assert.ok(staffTools.includes('lop_phu_trach_cua_toi'));
  // The system prompt carries the manager-configured warning levels.
  const prompt = await aiCare.systemPromptFor(await asUser('cskh'));
  assert.match(prompt, /Cấm thi/);
  assert.match(prompt, /tiết/);

  // A tool outside the caller's set is refused even if the model asks for it.
  const refused = await aiCare.executeTool(await asUser('teacher'), 'khoi_luong_nhan_vien', {});
  assert.ok(refused.loi);

  // A teacher only sees their own course groups and students.
  const teacher = await asUser('teacher');
  const mine = await aiCare.executeTool(teacher, 'hoc_phan_cua_toi', {});
  const mineCodes = mine.hocPhan.map((g) => g.maNhom);
  assert.ok(mineCodes.includes('TEST-GROUP'));
  assert.ok(!mineCodes.includes('OTHER-GROUP'));
  assert.ok(
    (await aiCare.executeTool(teacher, 'thong_ke_hoc_phan', { groupCode: 'OTHER-GROUP' })).loi,
  );
  const found = await aiCare.executeTool(teacher, 'tra_cuu_sinh_vien', { keyword: 'Student' });
  const foundCodes = found.ketQua.map((s) => s.mssv);
  assert.ok(foundCodes.includes('TEST001'));
  assert.ok(!foundCodes.includes('TEST002'));
  // The manager can look up every student.
  const all = await aiCare.executeTool(await asUser('manager'), 'tra_cuu_sinh_vien', {
    keyword: 'Student',
  });
  const allCodes = all.ketQua.map((s) => s.mssv);
  assert.ok(allCodes.includes('TEST001') && allCodes.includes('TEST002'));

  // Chat validation, then 503 without an API key.
  assert.equal((await request('/ai/care', tokens.teacher, 'POST', { messages: [] })).status, 400);
  assert.equal(
    (
      await request('/ai/care', tokens.teacher, 'POST', {
        messages: [{ role: 'assistant', content: 'x' }],
      })
    ).status,
    400,
  );
  const noKey = await request('/ai/care', tokens.cskh, 'POST', {
    messages: [{ role: 'user', content: 'Hôm nay tôi nên gọi cho ai trước?' }],
  });
  assert.equal(noKey.status, 503);
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
  const ok = await request('/ai/staff-performance', tokens.manager, 'POST', {
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

  // The manager runs the business side: courses, class assignment, warning levels.
  assert.equal((await request('/course-groups', token)).status, 200);
  assert.equal((await request('/class-assignments', token)).status, 200);
  // System administration stays with the admin.
  for (const [path, method] of [
    ['/billing/orders', 'GET'],
    ['/permissions', 'GET'],
    ['/settings/integrations', 'GET'],
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

test('permission matrix: admin grants and revokes role permissions, taking effect immediately', async () => {
  await ensureCskh();
  // Only the admin may read or change the matrix.
  for (const key of ['manager', 'cskh', 'teacher']) {
    assert.equal((await request('/permissions', tokens[key])).status, 403, key);
    assert.equal((await request('/permissions', tokens[key], 'PUT', { matrix: {} })).status, 403);
  }
  const initial = await request('/permissions', tokens.admin);
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.body.matrix, initial.body.defaults);
  assert.ok(initial.body.matrix.manager.includes('students.view'));

  // Unknown roles or keys are rejected; the admin role itself is not configurable.
  for (const matrix of [{ admin: [] }, { staff: ['accounts.manage'] }, { staff: 'reports.view' }])
    assert.equal((await request('/permissions', tokens.admin, 'PUT', { matrix })).status, 400);

  // /auth/me reports the live permissions; the admin has a fixed, view-only set.
  const me = await request('/auth/me', tokens.cskh);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'staff');
  assert.ok(me.body.permissions.includes('reports.view'));
  assert.ok(!me.body.permissions.includes('students.view'));
  assert.deepEqual((await request('/auth/me', tokens.admin)).body.permissions.sort(), [
    'ai.chat',
    'callTasks.viewAll',
    'reports.view',
    'students.view',
  ]);

  try {
    // Grant staff the student list and course management; revoke reports; manager untouched.
    const saved = await request('/permissions', tokens.admin, 'PUT', {
      matrix: { staff: ['students.view', 'courses.manage', 'callTasks.update'] },
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.matrix.manager, initial.body.matrix.manager);
    assert.equal((await request('/students', tokens.cskh)).status, 200);
    assert.equal((await request('/course-groups', tokens.cskh)).status, 200);
    assert.equal((await request('/analytics/summary', tokens.cskh)).status, 403);
    // Admin-only areas stay admin-only whatever the matrix says.
    assert.equal((await request('/permissions', tokens.cskh)).status, 403);
    assert.equal((await request('/settings', tokens.cskh, 'PUT', {})).status, 403);

    // Revoking the manager's student access applies on their next request.
    await request('/permissions', tokens.admin, 'PUT', { matrix: { manager: [] } });
    assert.equal((await request('/students', tokens.manager)).status, 403);
    assert.equal((await request('/tasks/admin-all', tokens.manager)).status, 403);
    assert.equal((await request('/auth/me', tokens.manager)).body.permissions.length, 0);
    // The admin keeps its read-only view whatever the matrix says.
    assert.equal((await request('/students', tokens.admin)).status, 200);
  } finally {
    await request('/permissions', tokens.admin, 'PUT', { matrix: initial.body.defaults });
  }
  assert.equal((await request('/students', tokens.manager)).status, 200);
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
  assert.equal((await play(tokens.manager)).status, 403);
  assert.equal((await play(tokens.admin)).status, 403);
  assert.equal((await play(tokens.cskh)).status, 403);

  // History: everyone — management included — sees only their own calls.
  const own = await request(`/calls?studentId=${students[0]._id}`, tokens.teacher);
  assert.equal(own.body.items[0]._id, callId);
  assert.equal(own.body.items[0].callerId.fullName, 'teacher');
  for (const role of ['cskh', 'manager', 'admin']) {
    const others = await request(`/calls?studentId=${students[0]._id}`, tokens[role]);
    assert.equal(others.body.items.length, 0);
  }

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

test('system overview is admin-only and summarises accounts, data, activity and integrations', async () => {
  for (const role of ['manager', 'cskh', 'teacher'])
    assert.equal((await request('/overview', tokens[role])).status, 403);
  const res = await request('/overview', tokens.admin);
  assert.equal(res.status, 200);
  const { users, data, activity, integrations, subscription } = res.body;
  assert.equal(users.total, await NguoiDung.countDocuments());
  assert.ok(users.byRole.admin >= 1);
  assert.ok(users.recent.length <= 5 && !('password' in users.recent[0]));
  assert.equal(data.students, await SinhVien.countDocuments());
  assert.equal(activity.length, 7);
  assert.ok(activity.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date)));
  assert.ok(integrations.some((g) => g.name === 'Email (SMTP)'));
  assert.equal(typeof subscription.active, 'boolean');
});
