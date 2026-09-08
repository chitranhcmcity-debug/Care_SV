const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-test-secret-with-at-least-32-characters';
const app = require('../app');
const User = require('../models/User');
const Student = require('../models/Student');
const CourseGroup = require('../models/CourseGroup');
const Attendance = require('../models/Attendance');
const CallTask = require('../models/CallTask');
const Settings = require('../models/SystemSettings');
const { getConfig } = require('../config/env');
const { dateKey } = require('../utils/validation');
const { CALL_STATUS, CALL_STATUSES } = require('../constants/callStatus');
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
    User.init(),
    Student.init(),
    CourseGroup.init(),
    Attendance.init(),
    CallTask.init(),
  ]);
  const password = await bcrypt.hash('test-password', 4);
  users = {};
  tokens = {};
  for (const [key, role] of [
    ['admin', 'admin'],
    ['teacher', 'teacher'],
    ['staff', 'staff'],
    ['other', 'staff'],
  ]) {
    users[key] = await User.create({ fullName: key, email: `${key}@example.test`, password, role });
    tokens[key] = sign(users[key]);
  }
  students = await Student.create([
    { studentCode: 'TEST001', fullName: 'Student A', classCode: 'TEST' },
    { studentCode: 'TEST002', fullName: 'Student B', classCode: 'OTHER' },
  ]);
  group = await CourseGroup.create({
    groupCode: 'TEST-GROUP',
    teacherId: users.teacher._id,
    students: [students[0]._id],
  });
  otherGroup = await CourseGroup.create({
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

test('crawler requires login and admin, and validates bounds before connecting externally', async () => {
  assert.equal((await request('/crawler/scan-progress')).status, 401);
  assert.equal((await request('/crawler/scan-progress', tokens.staff)).status, 403);
  assert.equal((await request('/crawler/scan-progress?endSeq=999999', tokens.admin)).status, 400);
});
test('staff cannot use global administrative APIs', async () => {
  for (const path of [
    '/call-tasks/admin-all',
    '/analytics/summary',
    '/course-groups',
    '/auth/class-assignments',
  ]) {
    assert.equal((await request(path, tokens.staff)).status, 403, path);
  }
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
  assert.equal(await Attendance.countDocuments(), 0);
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
  assert.equal(await Attendance.countDocuments(), 1);
  assert.equal(await CallTask.countDocuments(), 1);
  const task = await CallTask.findOne();
  assert.equal(dateKey(task.absenceDate), '2026-01-12');
});
test('task ownership prevents modifying another staff task or student profile', async () => {
  const task = await CallTask.findOne();
  const other = String(task.assignedStaffId) === String(users.staff._id) ? 'other' : 'staff';
  assert.equal(
    (
      await request(`/call-tasks/${task._id}/update`, tokens[other], 'PUT', {
        status: 'Đã liên hệ',
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
  const record = await Attendance.findOne();
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
  assert.equal(await CallTask.countDocuments(), 0);
});
test('admin-only assignment sends tasks to admin and deletion cleans untouched tasks', async () => {
  await Settings.create({ taskAssignmentRule: 'admin-only' });
  const result = await request('/attendance/submit', tokens.admin, 'POST', {
    courseGroupId: String(group._id),
    absentStudentIds: [String(students[0]._id)],
    date: '2026-01-13T12:00:00',
  });
  assert.equal(result.status, 201);
  assert.equal(String((await CallTask.findOne()).assignedStaffId), String(users.admin._id));
  assert.equal(
    (await request(`/attendance/history/${result.body.attendance._id}`, tokens.admin, 'DELETE'))
      .status,
    200,
  );
  assert.equal(await CallTask.countDocuments(), 0);
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
  const course = await CourseGroup.create({
    groupCode: 'QUERY-[GROUP]',
    teacherId: users.teacher._id,
    students: [students[0]._id],
    startDate: new Date(2020, 0, 6, 12),
    endDate: new Date(2020, 0, 13, 12),
    scheduleDays: ['Thứ 2'],
  });
  const records = await Attendance.create([
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
  const task = await CallTask.create({
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
  const saved = await CallTask.findById(task._id);
  assert.equal(saved.status, CALL_STATUS.CONTACTED);
  assert.equal(saved.callAttempts, CALL_STATUSES.length);
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
