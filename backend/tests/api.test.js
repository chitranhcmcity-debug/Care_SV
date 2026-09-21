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
  await Student.create({
    studentCode: 'KEEP00001',
    fullName: 'Keep Me',
    classCode: 'HOMECLASS',
    phone: '0901111111',
    parentPhone: '0902222222',
  });
  await CourseGroup.create({ groupCode: 'IMP_GROUP_CD25X' });
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
  const kept = await Student.findOne({ studentCode: 'KEEP00001' });
  assert.equal(kept.phone, '0901111111');
  assert.equal(kept.parentPhone, '0902222222');
  assert.equal(kept.classCode, 'HOMECLASS');
  const created = await Student.findOne({ studentCode: 'NEW000001' });
  assert.equal(created.classCode, 'CD25X');
});

test('excel templates require an admin token', async () => {
  for (const path of ['/excel/course-template', '/excel/export-template']) {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, tokens.teacher)).status, 403);
  }
});

test('reason analytics prefers category and matches whole words only', async () => {
  await CallTask.deleteMany({});
  const base = {
    studentId: students[0]._id,
    courseGroupId: group._id,
    assignedStaffId: users.admin._id,
    absenceDate: new Date(),
  };
  await CallTask.create([
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
  const rrGroup = await CourseGroup.create({ groupCode: 'RR_GROUP' });
  const rrStudents = await Student.create([
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
  const doomedStaff = await User.create({
    fullName: 'Doomed Staff',
    email: 'doomed-staff@example.test',
    password: await bcrypt.hash('x', 4),
    role: 'staff',
  });
  const openTask = await CallTask.create({
    studentId: students[0]._id,
    courseGroupId: group._id,
    assignedStaffId: doomedStaff._id,
    absenceDate: new Date(),
  });
  const doneTask = await CallTask.create({
    studentId: students[0]._id,
    courseGroupId: group._id,
    assignedStaffId: doomedStaff._id,
    absenceDate: new Date(),
    status: CALL_STATUS.CONTACTED,
  });

  const response = await request(`/auth/staff/${doomedStaff._id}`, tokens.admin, 'DELETE');
  assert.equal(response.status, 200);
  assert.equal((await CallTask.findById(openTask._id)).assignedStaffId.toString(), users.admin.id);
  // Completed tasks are historical: left pointing at the deleted user, not reassigned.
  assert.equal((await CallTask.findById(doneTask._id)).assignedStaffId.toString(), doomedStaff.id);
});

test('deleting a teacher clears teacherId on their course groups', async () => {
  const doomedTeacher = await User.create({
    fullName: 'Doomed Teacher',
    email: 'doomed-teacher@example.test',
    password: await bcrypt.hash('x', 4),
    role: 'teacher',
  });
  const taughtGroup = await CourseGroup.create({
    groupCode: 'TAUGHT_GROUP',
    teacherId: doomedTeacher._id,
  });

  const response = await request(`/auth/staff/${doomedTeacher._id}`, tokens.admin, 'DELETE');
  assert.equal(response.status, 200);
  assert.equal((await CourseGroup.findById(taughtGroup._id)).teacherId, null);
});

test('deleting a course group cascades to its attendance, call tasks and student enrollment', async () => {
  const doomedStudent = await Student.create({
    studentCode: 'DOOM00001',
    fullName: 'Doomed Student',
    classCode: 'DOOM',
    courseGroups: ['DOOM_GROUP'],
  });
  const doomedGroup = await CourseGroup.create({
    groupCode: 'DOOM_GROUP',
    students: [doomedStudent._id],
  });
  const attendance = await Attendance.create({
    courseGroupId: doomedGroup._id,
    absentStudents: [doomedStudent._id],
  });
  const task = await CallTask.create({
    studentId: doomedStudent._id,
    courseGroupId: doomedGroup._id,
    assignedStaffId: users.admin._id,
    absenceDate: new Date(),
  });

  const response = await request(`/course-groups/${doomedGroup._id}`, tokens.admin, 'DELETE');
  assert.equal(response.status, 200);
  assert.equal(await Attendance.countDocuments({ _id: attendance._id }), 0);
  assert.equal(await CallTask.countDocuments({ _id: task._id }), 0);
  assert.ok(!(await Student.findById(doomedStudent._id)).courseGroups.includes('DOOM_GROUP'));
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
