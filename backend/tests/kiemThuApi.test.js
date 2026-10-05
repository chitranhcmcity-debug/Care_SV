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
delete process.env.BREVO_API_KEY;
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
const HoSoChamSoc = require('../models/HoSoChamSoc');
const Settings = require('../models/CaiDatHeThong');
const UnitConfig = require('../models/CauHinhDonVi');
const NhiemVu = require('../models/NhiemVu');
const DonThanhToan = require('../models/DonThanhToan');
const CuocGoi = require('../models/CuocGoi');
const fs = require('fs');
const path = require('path');
const payosService = require('../services/dichVuPayOS');
const { getConfig } = require('../utils/moiTruong');
const { dateKey } = require('../utils/kiemTra');
const { CARE_STATUS, TASK_STATUS } = require('../utils/hangSo');
const { escapeHtml } = require('../services/dichVuEmail');
const { saveAttendance, deleteAttendance } = require('../services/dichVuDiemDanh');
// Past sessions can no longer be written through the API (they are final once the class ends),
// so fixtures record them through the service, as the lecturer.
const recordPast = (courseGroup, absentStudentIds, date) =>
  saveAttendance({
    group: courseGroup,
    user: { id: String(users.teacher._id) },
    absentStudentIds: absentStudentIds.map(String),
    date: new Date(date),
  });
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
// One absent session (4 periods) reaches this level, so tests can open care cases quickly.
async function useQuickWarningLevel() {
  // Care settings live per unit; the fixture accounts are not in a unit (unitId null).
  await UnitConfig.updateOne(
    { unitId: null },
    { warningLevels: [{ name: 'Nhắc nhở', unit: 'periods', threshold: 4, color: '#eab308' }] },
    { upsert: true },
  );
  require('../services/dichVuCanhBao').clearWarningCache();
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
    HoSoChamSoc.init(),
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
  for (const path of ['/care-cases/staff', '/course-groups', '/class-assignments']) {
    assert.equal((await request(path, tokens.staff)).status, 403, path);
  }
  // Staff may read reports (their own classes); teachers may not.
  assert.equal((await request('/analytics/summary', tokens.staff)).status, 200);
  assert.equal((await request('/analytics/summary', tokens.teacher)).status, 403);
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
  // Trưởng phòng / PHT only look: they cannot write attendance, even for today.
  assert.equal((await request('/attendance/submit', tokens.manager, 'POST', valid)).status, 403);
  assert.equal(await DiemDanh.countDocuments(), 0);
});
test('past attendance preserves date and recorder; a warning opens one care case for the class staff', async () => {
  await useQuickWarningLevel();
  const date = '2026-01-12T12:00:00';
  const result = await recordPast(group, [students[0]._id], date);
  assert.equal(result.isUpdate, false);
  assert.equal(String(result.attendance.recordedBy), String(users.teacher._id));
  // The absent students come back so the lecturer can choose to call them.
  assert.equal(result.absentStudents[0].studentCode, 'TEST001');
  assert.equal(result.openedCases.length, 1);
  for (const again of await Promise.all([
    recordPast(group, [students[0]._id], date),
    recordPast(group, [students[0]._id], date),
  ]))
    assert.equal(again.isUpdate, true);
  assert.equal(await DiemDanh.countDocuments(), 1);
  assert.equal(await HoSoChamSoc.countDocuments(), 1);
  const careCase = await HoSoChamSoc.findOne();
  assert.equal(careCase.source, 'canh_bao');
  assert.equal(careCase.warning.level, 'Nhắc nhở');
  // Student A's class TEST is assigned to users.staff, so the case goes straight to them.
  assert.equal(careCase.status, CARE_STATUS.IN_PROGRESS);
  assert.equal(String(careCase.assignedStaffId), String(users.staff._id));
  assert.ok(careCase.steps.length >= 4);
});
test('care case ownership prevents working another staff case or student profile', async () => {
  const careCase = await HoSoChamSoc.findOne();
  const stepId = careCase.steps[0]._id;
  for (const token of [tokens.other, tokens.admin])
    assert.equal(
      (await request(`/care-cases/${careCase._id}/steps/${stepId}`, token, 'PUT', { done: true }))
        .status,
      403,
    );
  assert.equal((await request(`/care-cases/${careCase._id}`, tokens.other)).status, 403);
  assert.equal((await request(`/students/${students[0]._id}/profile`, tokens.other)).status, 403);
  for (const token of [tokens.other, tokens.admin])
    assert.equal(
      (await request(`/students/${students[0]._id}/tags`, token, 'PUT', { tags: ['x'] })).status,
      403,
    );
  // The admin may look at the case, not work on it.
  assert.equal((await request(`/care-cases/${careCase._id}`, tokens.admin)).status, 200);
  const bad = await request(`/care-cases/${careCase._id}/notes`, tokens.staff, 'POST', {
    kind: 'chi_dao',
    text: 'Nhân viên không gửi chỉ đạo',
  });
  assert.equal(bad.status, 403);
  assert.equal(
    (
      await request(`/care-cases/${careCase._id}/notes`, tokens.staff, 'POST', {
        kind: 'x',
        text: 'a',
      })
    ).status,
    400,
  );
});
test('attendance history edits enforce ownership; the care case outlives a corrected absence', async () => {
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
  // Nor can the Trưởng phòng / PHT: a finished session is final for everyone.
  assert.equal(
    (
      await request(`/attendance/history/${record._id}`, tokens.manager, 'PUT', {
        absentStudentIds: [],
      })
    ).status,
    403,
  );
  await recordPast(group, [], record.date);
  // Care is a human process: correcting attendance does not delete the case.
  assert.equal(await HoSoChamSoc.countDocuments(), 1);
});
test('a warning in a class without staff waits for a directive; the manager directs someone', async () => {
  const result = await recordPast(otherGroup, [students[1]._id], '2026-01-13T12:00:00');
  const careCase = await HoSoChamSoc.findOne({ studentId: students[1]._id });
  assert.equal(careCase.status, CARE_STATUS.AWAITING);
  assert.equal(careCase.assignedStaffId, null);
  const queue = await request('/care-cases?status=cho_chi_dao', tokens.manager);
  assert.deepEqual(
    queue.body.items.map((c) => c._id),
    [String(careCase._id)],
  );
  const { staff: carer, token: carerToken } = await createTaskStaff('directed');
  // Only a manager directs, and only to active CSSV staff.
  for (const [token, staffId, status] of [
    [carerToken, carer._id, 403],
    [tokens.admin, carer._id, 403],
    [tokens.manager, users.teacher._id, 400],
  ])
    assert.equal(
      (
        await request(`/care-cases/${careCase._id}/direct`, token, 'PUT', {
          assignedStaffId: String(staffId),
        })
      ).status,
      status,
    );
  // The carer cannot see a student outside their classes before being directed.
  assert.equal((await request(`/students/${students[1]._id}/profile`, carerToken)).status, 403);
  const directed = await request(`/care-cases/${careCase._id}/direct`, tokens.manager, 'PUT', {
    assignedStaffId: String(carer._id),
    directive: 'Liên hệ gia đình trong tuần này.',
    dueDate: '2026-02-01',
  });
  assert.equal(directed.status, 200);
  assert.equal(directed.body.status, CARE_STATUS.IN_PROGRESS);
  assert.equal(directed.body.assignedStaffId.fullName, carer.fullName);
  assert.ok(directed.body.notes.some((n) => n.kind === 'chi_dao'));
  assert.equal((await request(`/students/${students[1]._id}/profile`, carerToken)).status, 200);
  assert.equal(
    (await request(`/attendance/history/${result.attendance._id}`, tokens.manager, 'DELETE'))
      .status,
    403,
  );
  await deleteAttendance(result.attendance);
});
test('care case work: steps, findings, exchange, AI steps, then close request and approval', async () => {
  const careCase = await HoSoChamSoc.findOne({ studentId: students[1]._id });
  const carer = await NguoiDung.findById(careCase.assignedStaffId);
  const token = sign(carer);
  const id = careCase._id;
  const stepId = careCase.steps[1]._id;
  const done = await request(`/care-cases/${id}/steps/${stepId}`, token, 'PUT', {
    done: true,
    note: 'Đã hỏi',
  });
  assert.equal(done.status, 200);
  assert.equal(done.body.steps[1].done, true);
  // The assignee sees the case as theirs to work on (checked after the refs are populated).
  assert.deepEqual(done.body.permissions, { manage: false, work: true });
  const added = await request(`/care-cases/${id}/steps`, tokens.manager, 'POST', {
    title: 'Gặp trực tiếp sinh viên',
  });
  assert.equal(added.status, 201);
  assert.equal(added.body.steps.at(-1).source, 'quan_ly');
  assert.equal(
    (await request(`/care-cases/${id}/steps`, token, 'POST', { title: '' })).status,
    400,
  );
  const findings = await request(`/care-cases/${id}/findings`, token, 'PUT', {
    cause: 'Bận đi làm ca tối',
    solution: 'Tư vấn chuyển nhóm học phần buổi sáng',
  });
  assert.equal(findings.body.cause, 'Bận đi làm ca tối');
  const reported = await request(`/care-cases/${id}/notes`, token, 'POST', {
    kind: 'kho_khan',
    text: 'Gia đình khó liên lạc',
  });
  assert.equal(reported.status, 201);
  const replied = await request(`/care-cases/${id}/notes`, tokens.manager, 'POST', {
    kind: 'chi_dao',
    text: 'Nhờ giảng viên chủ nhiệm hỗ trợ',
  });
  assert.equal(replied.status, 201);
  // AI suggestions need an API key.
  assert.equal((await request(`/care-cases/${id}/ai-steps`, token, 'POST', {})).status, 503);

  // Close request: needs a result and a report; the manager may send it back, then approve.
  assert.equal(
    (await request(`/care-cases/${id}/close-request`, token, 'POST', { result: 'x', summary: 'a' }))
      .status,
    400,
  );
  const asked = await request(`/care-cases/${id}/close-request`, token, 'POST', {
    result: 'tien_bo',
    summary: 'Sinh viên đã đi học đều trở lại.',
    early: true,
  });
  assert.equal(asked.body.status, CARE_STATUS.CLOSING);
  assert.equal((await request(`/care-cases/${id}/close`, token, 'POST', {})).status, 403);
  const back = await request(`/care-cases/${id}/close`, tokens.manager, 'POST', {
    approve: false,
    note: 'Theo dõi thêm 1 tuần',
  });
  assert.equal(back.body.status, CARE_STATUS.IN_PROGRESS);
  await request(`/care-cases/${id}/close-request`, token, 'POST', {
    result: 'tien_bo',
    summary: 'Đã ổn định.',
  });
  const closed = await request(`/care-cases/${id}/close`, tokens.manager, 'POST', {
    approve: true,
  });
  assert.equal(closed.body.status, CARE_STATUS.CLOSED);
  assert.equal(closed.body.closing.approvedBy.fullName, 'manager');
  // Closed cases are history: no more work, and a new case can be opened for the student.
  assert.equal(
    (await request(`/care-cases/${id}/steps`, token, 'POST', { title: 'x' })).status,
    400,
  );
  const history = await request('/care-cases?status=closed', tokens.manager);
  assert.ok(history.body.items.some((c) => c._id === String(id)));
  const summary = await request('/care-cases/summary', tokens.manager);
  assert.ok(summary.body.counts.da_ket_thuc >= 1);
});
test('lecturers propose care; a manager can open a directed case; one open case per student', async () => {
  const teacherCases = await request('/care-cases', tokens.teacher);
  assert.equal(teacherCases.status, 200);
  // The teacher only proposes for students of their own course groups.
  assert.equal(
    (
      await request('/care-cases', tokens.teacher, 'POST', {
        studentId: String(students[1]._id),
        reason: 'x',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/care-cases', tokens.admin, 'POST', {
        studentId: String(students[1]._id),
        reason: 'x',
      })
    ).status,
    403,
  );
  // Student A already has an open case (from the warning).
  const dup = await request('/care-cases', tokens.teacher, 'POST', {
    studentId: String(students[0]._id),
    reason: 'Có dấu hiệu bỏ học',
  });
  assert.equal(dup.status, 409);
  // Student B's case is closed, so a new one can be opened, here directed by the manager.
  const { staff: carer } = await createTaskStaff('manager-opened');
  const opened = await request('/care-cases', tokens.manager, 'POST', {
    studentId: String(students[1]._id),
    reason: 'Nghỉ nhiều tuần qua',
    assignedStaffId: String(carer._id),
    directive: 'Gọi phụ huynh ngay.',
  });
  assert.equal(opened.status, 201);
  assert.equal(opened.body.status, CARE_STATUS.IN_PROGRESS);
  assert.equal(opened.body.proposedBy.fullName, 'manager');
  await HoSoChamSoc.deleteOne({ _id: opened.body._id });
  await UnitConfig.updateOne({ unitId: null }, { $unset: { warningLevels: 1 } });
  require('../services/dichVuCanhBao').clearWarningCache();
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
  await UnitConfig.updateOne({ unitId: null }, { $unset: { warningLevels: 1 } });
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
  // Once the class ends the session is final, even if it was taken.
  const over = attendanceWindow(g, { now: at(1, 22, 0), hasRecordToday: true });
  assert.equal(over.open, false);
  assert.equal(over.locked, true);
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
  // The Trưởng phòng / PHT can look at the book but never write it.
  const managerView = await request(`/attendance/window/${closed._id}`, tokens.manager);
  assert.equal(managerView.status, 200);
  assert.equal(managerView.body.open, false);
  assert.equal(managerView.body.canWrite, false);
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
  assert.equal((await request('/care-cases', tokens.other)).status, 401);
  await request(`/auth/staff/${users.other._id}/status`, tokens.admin, 'PUT', { status: 'active' });
  assert.equal((await request('/care-cases', tokens.other)).status, 401);
});

test('create-staff and reset-password report emailSent=false when SMTP is not configured', async () => {
  const created = await request('/auth/create-staff', tokens.admin, 'POST', {
    fullName: '<b>Mail Test</b>',
    email: 'mail-test@itc.edu.vn',
    managerId: String(users.manager._id),
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
  'self-registration: manager approves, the emailed activation key unlocks the account',
  withFakeSmtp(async () => {
    const email = 'new-teacher@itc.edu.vn';
    const payload = {
      fullName: 'GV Mới',
      email,
      password: 'secret-pass-1',
      role: 'teacher',
      managerEmail: users.manager.email,
    };
    const credentials = { email, password: payload.password };

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
    assert.equal(pending.status, 'pending');
    assert.equal(pending.role, 'teacher');
    // Every active manager is asked; the applicant gets nothing until approval.
    assert.ok(sentMails.findLast((m) => m.to === users.manager.email).text.includes(email));
    assert.ok(!sentMails.some((m) => m.to === email));

    // Cannot log in while waiting, and a repeat request inside the cooldown is refused.
    const early = await request('/auth/login', null, 'POST', credentials);
    assert.equal(early.status, 403);
    assert.equal(early.body.code, 'PENDING_APPROVAL');
    assert.equal((await request('/auth/register', null, 'POST', payload)).status, 429);

    // Only a Trưởng phòng / PHT sees and approves sign-ups.
    const path = `/auth/registrations/${pending._id}/approve`;
    assert.equal((await request('/auth/registrations', tokens.admin)).status, 403);
    assert.equal((await request(path, tokens.staff, 'POST')).status, 403);
    const listed = await request('/auth/registrations', tokens.manager);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.some((u) => u.email === email && u.status === 'pending'));
    assert.ok(!('activationKeyHash' in listed.body[0]));

    const approved = await request(path, tokens.manager, 'POST');
    assert.equal(approved.status, 200);
    assert.equal(approved.body.emailSent, true);
    const key = /Key kích hoạt: (\S+)/.exec(sentMails.findLast((m) => m.to === email).text)[1];
    assert.equal(approved.body.activationKey, key);
    assert.match(key, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    // Password alone is not enough; a wrong key is refused; the right key (any case) works once.
    const needsKey = await request('/auth/login', null, 'POST', credentials);
    assert.equal(needsKey.body.code, 'ACTIVATION_KEY_REQUIRED');
    const wrongKey = await request('/auth/login', null, 'POST', {
      ...credentials,
      activationKey: 'AAAA-BBBB-CCCC',
    });
    assert.equal(wrongKey.body.code, 'ACTIVATION_KEY_INVALID');
    const login = await request('/auth/login', null, 'POST', {
      ...credentials,
      activationKey: ` ${key.toLowerCase()} `,
    });
    assert.equal(login.status, 200);
    assert.equal((await NguoiDung.findOne({ email })).activationKeyHash, null);
    assert.equal((await request('/auth/login', null, 'POST', credentials)).status, 200);
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
  'self-registration: a manager can reject a sign-up',
  withFakeSmtp(async () => {
    const email = 'unknown-staff@itc.edu.vn';
    const payload = {
      fullName: 'Người Lạ',
      email,
      password: 'secret-pass-1',
      role: 'staff',
      managerEmail: users.manager.email,
    };
    assert.equal((await request('/auth/register', null, 'POST', payload)).status, 201);
    const { _id } = await NguoiDung.findOne({ email });
    const rejected = await request(`/auth/registrations/${_id}/reject`, tokens.manager, 'POST');
    assert.equal(rejected.status, 200);
    assert.equal(await NguoiDung.findOne({ email }), null);
    assert.match(sentMails.findLast((m) => m.to === email).subject, /không được chấp nhận/);
    // Already handled: a second decision finds nothing.
    assert.equal(
      (await request(`/auth/registrations/${_id}/approve`, tokens.manager, 'POST')).status,
      404,
    );
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

    assert.equal((await request('/care-cases', oldSession)).status, 401);
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
  assert.equal((await request('/care-cases', tokens.staff)).status, 401);
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
  assert.equal(
    (
      await request(`/attendance/history/${records[0]._id}`, tokens.manager, 'PUT', {
        absentStudentIds: [],
      })
    ).status,
    403,
  );
  // History shows who recorded each session, never their secrets.
  const managerHistory = await request(`/attendance/history/${course._id}`, tokens.manager);
  assert.equal(managerHistory.status, 200);
  const recorder = managerHistory.body.find((r) => r.recordedBy).recordedBy;
  assert.ok(recorder.fullName);
  assert.equal(recorder.password, undefined);
  assert.equal(recorder.tokenVersion, undefined);
  const fallback = await request(`/attendance/schedule/${group._id}`, tokens.teacher);
  assert.equal(fallback.status, 200);
  assert.equal(fallback.body.hasDates, false);
  assert.ok(fallback.body.sessions.every((item) => item.status === 'recorded'));
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

test('reason analytics classifies recorded causes and matches whole words only', async () => {
  await HoSoChamSoc.deleteMany({});
  const base = { studentId: students[0]._id, source: 'de_xuat', status: CARE_STATUS.CLOSED };
  await HoSoChamSoc.create([
    { ...base, cause: 'các bạn nghỉ hết' },
    { ...base, cause: 'đi làm ca tối' },
    { ...base, cause: 'Bệnh, phải nằm viện' },
  ]);
  const { body } = await request('/analytics/summary', tokens.admin);
  const counts = Object.fromEntries(body.reasonStats.map((r) => [r.reason, r.count]));
  assert.equal(counts['Lý do khác'], 1);
  assert.equal(counts['Bận đi làm'], 1);
  assert.equal(counts['Ốm / Sức khỏe'], 1);
  assert.equal(body.metrics.closedCases, 3);
  await HoSoChamSoc.deleteMany({});
});

test('care cases follow the administrative class; transfers move open cases and keep history', async () => {
  await useQuickWarningLevel();
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
    const res = await recordPast(ccGroup, [student._id], new Date(2025, 5, 2 + i, 12));
    assert.equal(res.openedCases.length, 1);
  }
  assert.equal(
    await HoSoChamSoc.countDocuments({
      studentId: { $in: ccStudents.map((s) => s._id) },
      assignedStaffId: first._id,
    }),
    2,
  );
  // The second staff member cannot see this class yet.
  assert.equal((await request(`/students/${ccStudents[0]._id}/profile`, secondToken)).status, 403);

  const transfer = await request('/class-assignments/transfer', tokens.manager, 'POST', {
    fromStaffId: String(first._id),
    toStaffId: String(second._id),
  });
  assert.equal(transfer.status, 200);
  assert.equal(transfer.body.reassignedCaseCount, 2);
  assert.equal(
    await HoSoChamSoc.countDocuments({
      studentId: { $in: ccStudents.map((s) => s._id) },
      assignedStaffId: second._id,
    }),
    2,
  );
  assert.equal((await request(`/students/${ccStudents[0]._id}/profile`, secondToken)).status, 200);
  await UnitConfig.updateOne({ unitId: null }, { $unset: { warningLevels: 1 } });
  require('../services/dichVuCanhBao').clearWarningCache();

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

test('deleting staff releases their classes (history kept) and sends open cases back to the managers', async () => {
  const doomedStaff = await NguoiDung.create({
    fullName: 'Doomed Staff',
    email: 'doomed-staff@example.test',
    password: await bcrypt.hash('x', 4),
    role: 'staff',
  });
  await request('/class-assignments/DOOMCLS', tokens.manager, 'PUT', {
    staffId: String(doomedStaff._id),
  });
  const openCase = await HoSoChamSoc.create({
    studentId: students[0]._id,
    source: 'de_xuat',
    status: CARE_STATUS.IN_PROGRESS,
    assignedStaffId: doomedStaff._id,
  });
  const doneCase = await HoSoChamSoc.create({
    studentId: students[0]._id,
    source: 'de_xuat',
    status: CARE_STATUS.CLOSED,
    assignedStaffId: doomedStaff._id,
  });

  const response = await request(`/auth/staff/${doomedStaff._id}`, tokens.admin, 'DELETE');
  assert.equal(response.status, 200);
  const reopened = await HoSoChamSoc.findById(openCase._id);
  assert.equal(reopened.assignedStaffId, null);
  assert.equal(reopened.status, CARE_STATUS.AWAITING);
  // Closed cases are history: left pointing at the deleted user, not reassigned.
  assert.equal(
    (await HoSoChamSoc.findById(doneCase._id)).assignedStaffId.toString(),
    doomedStaff.id,
  );
  await HoSoChamSoc.deleteMany({ _id: { $in: [openCase._id, doneCase._id] } });
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

test('deleting a course group cascades to its attendance and student enrollment', async () => {
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

  const response = await request(`/course-groups/${doomedGroup._id}`, tokens.manager, 'DELETE');
  assert.equal(response.status, 200);
  assert.equal(await DiemDanh.countDocuments({ _id: attendance._id }), 0);
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

test('task progress: category/priority, % reports, rework and quality score', async () => {
  const { staff, token } = await createTaskStaff('progress');
  const { token: bystanderToken } = await createTaskStaff('progress-bystander');

  const invalid = await request('/tasks', tokens.manager, 'POST', {
    title: 'x',
    description: 'y',
    assignedTo: String(staff._id),
    category: 'khong_ton_tai',
  });
  assert.equal(invalid.status, 400);

  const create = await request('/tasks', tokens.manager, 'POST', {
    title: 'Soạn kế hoạch tuyển sinh học kỳ mới',
    description: 'Lập kế hoạch và dự toán kinh phí tuyển sinh.',
    assignedTo: String(staff._id),
    category: 'tuyen_sinh',
    priority: 'cao',
    dueDate: '2099-12-31',
  });
  assert.equal(create.status, 201);
  assert.equal(create.body.task.category, 'tuyen_sinh');
  assert.equal(create.body.task.priority, 'cao');
  assert.equal(create.body.task.progress, 0);
  const taskId = create.body.task._id;

  // Progress can only be reported once the task is acknowledged, by its assignee, below 100%.
  const report = (tok, body) => request(`/tasks/${taskId}/progress`, tok, 'PUT', body);
  assert.equal((await report(token, { percent: 30 })).status, 400);
  await request(`/tasks/${taskId}/acknowledge`, token, 'PUT');
  assert.equal((await report(bystanderToken, { percent: 30 })).status, 403);
  assert.equal((await report(tokens.manager, { percent: 30 })).status, 403);
  assert.equal((await report(token, { percent: 100 })).status, 400);
  assert.equal((await report(token, { percent: 12.5 })).status, 400);
  const progressed = await report(token, { percent: 60, note: 'Đã xong phần dự toán' });
  assert.equal(progressed.status, 200);
  assert.equal(progressed.body.task.progress, 60);
  assert.equal(progressed.body.task.progressLog.at(-1).note, 'Đã xong phần dự toán');

  const submit = async () => {
    const form = new FormData();
    form.append('note', 'Đã hoàn thành kế hoạch.');
    return fetch(`${base}/tasks/${taskId}/submit`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then((r) => r.json());
  };
  assert.equal((await submit()).task.progress, 100);

  const reject = await request(`/tasks/${taskId}/review`, tokens.manager, 'PUT', {
    approve: false,
    score: 5, // ignored on rejection
  });
  assert.equal(reject.body.task.reworkCount, 1);
  assert.equal(reject.body.task.reviewScore, null);
  assert.ok(reject.body.task.progress < 100);

  await submit();
  assert.equal(
    (await request(`/tasks/${taskId}/review`, tokens.manager, 'PUT', { approve: true, score: 7 }))
      .status,
    400,
  );
  const approve = await request(`/tasks/${taskId}/review`, tokens.manager, 'PUT', {
    approve: true,
    score: 4,
  });
  assert.equal(approve.status, 200);
  assert.equal(approve.body.task.reviewScore, 4);

  // An overdue open task in another category.
  await NhiemVu.create({
    title: 'Báo cáo tháng',
    description: 'Tổng hợp báo cáo tháng trước.',
    assignedBy: users.manager._id,
    assignedTo: staff._id,
    category: 'bao_cao',
    dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  });

  // Only task managers see the progress board.
  assert.equal((await request('/tasks/staff-progress', token)).status, 403);
  assert.equal((await request('/tasks/staff-progress', tokens.admin)).status, 403);
  assert.equal((await request('/tasks/staff-progress?from=abc', tokens.manager)).status, 400);
  const board = await request('/tasks/staff-progress', tokens.manager);
  assert.equal(board.status, 200);
  const row = board.body.staff.find((r) => r.staff._id === String(staff._id));
  assert.equal(row.tasks.total, 2);
  assert.equal(row.tasks.completed, 1);
  assert.equal(row.tasks.completedOnTime, 1);
  assert.equal(row.tasks.overdue, 1);
  assert.equal(row.tasks.reworkCount, 1);
  assert.equal(row.tasks.avgScore, 4);
  assert.deepEqual(row.tasks.byCategory.tuyen_sinh, { total: 1, completed: 1 });
  assert.equal(row.rates.completion, 50);
  assert.equal(row.rates.onTime, 100);
  assert.equal(row.rates.quality, 75);
  assert.equal(row.rates.care, null); // no care cases: left out of the KPI, not counted as 0
  // (0.5*0.3 + 1*0.25 + 0.75*0.25) / 0.8 = 73.4 → 73
  assert.equal(row.kpiScore, 73);
  assert.equal(row.kpiRating, 'Tốt');

  // A period that excludes both tasks leaves the staff member listed with empty metrics.
  const empty = await request(
    '/tasks/staff-progress?from=2000-01-01&to=2000-01-31',
    tokens.manager,
  );
  const emptyRow = empty.body.staff.find((r) => r.staff._id === String(staff._id));
  assert.equal(emptyRow.tasks.total, 0);
  assert.equal(emptyRow.kpiScore, null);

  // AI assessment: manager only, and a clean 503 without an API key.
  assert.equal(
    (await request('/ai/staff-performance', token, 'POST', { staffId: String(staff._id) })).status,
    403,
  );
  assert.equal(
    (await request('/ai/staff-performance', tokens.manager, 'POST', { staffId: String(staff._id) }))
      .status,
    503,
  );
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

test('AI call-advice enforces care case ownership and fails gracefully without a key', async () => {
  const { staff: assignee, token: assigneeToken } = await createTaskStaff('ai-call-advice');
  const { token: bystanderToken } = await createTaskStaff('ai-call-advice-bystander');
  const careCase = await HoSoChamSoc.create({
    studentId: students[1]._id,
    source: 'de_xuat',
    status: CARE_STATUS.IN_PROGRESS,
    assignedStaffId: assignee._id,
  });

  assert.equal(
    (await request('/ai/call-advice', bystanderToken, 'POST', { careCaseId: String(careCase._id) }))
      .status,
    403,
  );
  assert.equal(
    (await request('/ai/call-advice', assigneeToken, 'POST', { careCaseId: 'not-an-id' })).status,
    400,
  );
  const ok = await request('/ai/call-advice', assigneeToken, 'POST', {
    careCaseId: String(careCase._id),
  });
  assert.equal(ok.status, 503);
  assert.match(ok.body.message, /API key/);
  await HoSoChamSoc.deleteOne({ _id: careCase._id });
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
  assert.ok(!teacherTools.includes('ho_so_cham_soc_cua_toi'));
  const staffTools = await toolNames('cskh');
  assert.ok(staffTools.includes('ho_so_cham_soc_cua_toi'));
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

test('AI Care actions: only prepared by the model, run when the same user confirms', async () => {
  const aiCare = require('../services/dichVuAiCare');
  const { permissionsForRole } = require('../services/dichVuPhanQuyen');
  const asUser = async (user) => ({
    ...user.toObject(),
    id: String(user._id),
    permissions: await permissionsForRole(user.role),
  });
  const names = async (user) => aiCare.toolDefinitions(await asUser(user)).map((t) => t.name);
  const { staff, token: staffToken } = await createTaskStaff('ai-action');

  // Each role only gets the actions its permissions allow; everyone may open a page.
  assert.ok((await names(users.manager)).includes('giao_viec'));
  assert.ok((await names(staff)).includes('cap_nhat_ho_so_cham_soc'));
  assert.ok(!(await names(staff)).includes('giao_viec'));
  const adminTools = await names(users.admin);
  assert.ok(adminTools.includes('mo_trang') && !adminTools.includes('giao_viec'));

  // Preparing changes nothing and hands the UI a card to confirm.
  const manager = await asUser(users.manager);
  const ctx = { actions: [], navigate: null };
  const prepared = await aiCare.executeTool(
    manager,
    'giao_viec',
    { nhanVien: 'Task Staff ai-action', tieuDe: 'Tổng hợp SV cấm thi', moTa: 'Lập danh sách' },
    ctx,
  );
  assert.match(prepared.trangThai, /CHƯA THỰC HIỆN/);
  assert.equal(ctx.actions.length, 1);
  assert.equal(await NhiemVu.countDocuments({ title: 'Tổng hợp SV cấm thi' }), 0);

  // Another user cannot confirm it; the owner can, exactly once.
  const id = ctx.actions[0].id;
  assert.equal((await request(`/ai/care/actions/${id}/confirm`, staffToken, 'POST')).status, 404);
  const done = await request(`/ai/care/actions/${id}/confirm`, tokens.manager, 'POST');
  assert.equal(done.status, 200);
  assert.equal(
    await NhiemVu.countDocuments({ title: 'Tổng hợp SV cấm thi', assignedTo: staff._id }),
    1,
  );
  assert.equal(
    (await request(`/ai/care/actions/${id}/confirm`, tokens.manager, 'POST')).status,
    404,
  );

  // Unknown staff: the tool reports it instead of preparing anything.
  await assert.rejects(
    aiCare.executeTool(
      manager,
      'giao_viec',
      { nhanVien: 'Không Có Ai', tieuDe: 'x', moTa: 'y' },
      ctx,
    ),
    /Không tìm thấy nhân viên/,
  );
  // Opening a page needs no confirmation.
  await aiCare.executeTool(manager, 'mo_trang', { trang: '/students' }, ctx);
  assert.equal(ctx.navigate, '/students');
  await NhiemVu.deleteMany({ assignedTo: staff._id });
  await NguoiDung.deleteOne({ _id: staff._id });
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

test('PayOS: a manager buys a plan, signed webhook extends the subscription exactly once', async () => {
  const status = { value: 'PENDING', amount: 0 };
  await withFakePayOS(status, async (payosCalls) => {
    assert.equal(
      (await request('/billing/orders', tokens.teacher, 'POST', { planCode: 'goi_1_thang' }))
        .status,
      403,
    );
    // The admin only sets prices; buying is for Trưởng phòng / PHT.
    assert.equal(
      (await request('/billing/orders', tokens.admin, 'POST', { planCode: 'goi_1_thang' })).status,
      403,
    );
    assert.equal(
      (await request('/billing/orders', tokens.manager, 'POST', { planCode: 'khong-co' })).status,
      400,
    );

    const before = (await request('/billing/status', tokens.admin)).body;
    const created = await request('/billing/orders', tokens.manager, 'POST', {
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
    const created = await request('/billing/orders', tokens.manager, 'POST', {
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

test('PayOS: the admin sets plan prices, orders use the new price', async () => {
  const plans = [
    { name: 'Gói 3 tháng', months: 3, amount: 1200000 },
    { name: 'Gói 1 tháng', months: 1, amount: 450000 },
  ];
  assert.equal((await request('/billing/plans', tokens.manager, 'PUT', { plans })).status, 403);
  assert.equal(
    (
      await request('/billing/plans', tokens.admin, 'PUT', {
        plans: [...plans, { name: 'Trùng', months: 3, amount: 5000 }],
      })
    ).status,
    400,
  );
  const saved = await request('/billing/plans', tokens.admin, 'PUT', { plans });
  assert.equal(saved.status, 200);
  assert.deepEqual(
    saved.body.map((p) => [p.code, p.amount]),
    [
      ['goi_1_thang', 450000],
      ['goi_3_thang', 1200000],
    ],
  );
  assert.deepEqual((await request('/billing/plans', tokens.manager)).body, saved.body);
  await withFakePayOS({ value: 'PENDING', amount: 0 }, async (payosCalls) => {
    const created = await request('/billing/orders', tokens.manager, 'POST', {
      planCode: 'goi_3_thang',
    });
    assert.equal(created.status, 201);
    assert.equal(payosCalls.find((c) => c.method === 'POST').body.amount, 1200000);
  });
  await Settings.updateOne({}, { $unset: { subscriptionPlans: 1 } });
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
    (await request(`/students/${students.body.items[0]._id}/profile`, token)).status,
    200,
  );
  assert.equal((await request('/care-cases', token)).status, 200);
  assert.equal((await request('/care-cases/staff', token)).status, 200);
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
    ['/billing/plans', 'PUT'],
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
    'care.manage',
    'reports.view',
    'students.view',
  ]);

  try {
    // Grant staff the student list and course management; revoke reports; manager untouched.
    const saved = await request('/permissions', tokens.admin, 'PUT', {
      matrix: { staff: ['students.view', 'courses.manage', 'care.work'] },
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.matrix.manager, initial.body.matrix.manager);

    // Rights that only work for one role are dropped for the others instead of stored as no-ops.
    const onlyRoles = Object.fromEntries(saved.body.permissions.map((p) => [p.key, p.onlyRoles]));
    assert.deepEqual(onlyRoles['attendance.take'], ['teacher']);
    assert.deepEqual(onlyRoles['care.work'], ['staff']);
    const noop = await request('/permissions', tokens.admin, 'PUT', {
      matrix: { manager: [...initial.body.matrix.manager, 'attendance.take', 'care.work'] },
    });
    assert.deepEqual(noop.body.matrix.manager, initial.body.matrix.manager);
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
  const adminCall = await request('/calls', tokens.admin, 'POST', {
    studentId: String(students[0]._id),
    target: 'sinh_vien',
    method: 'dien_thoai',
  });
  assert.equal(adminCall.status, 403);
  assert.match(adminCall.body.message, /Quản trị viên chỉ được xem/);
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
  // Declining to record: no recording can be attached afterwards.
  const unrecorded = await request('/calls', tokens.teacher, 'POST', {
    studentId: String(students[0]._id),
    target: 'sinh_vien',
    method: 'dien_thoai',
    record: false,
  });
  assert.equal(unrecorded.status, 201);
  const started = await request('/calls', tokens.teacher, 'POST', {
    studentId: String(students[0]._id),
    target: 'phu_huynh',
    method: 'dien_thoai',
    courseGroupId: String(group._id),
    record: true,
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
  {
    const form = new FormData();
    form.append('file', new Blob(['ID3'], { type: 'audio/mpeg' }), 'x.mp3');
    const refused = await fetch(`${base}/calls/${unrecorded.body.call._id}/recording`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.teacher}` },
      body: form,
    });
    assert.equal(refused.status, 400);
  }
  assert.equal((await uploadAs(tokens.teacher, 'application/pdf')).status, 400);
  assert.equal((await uploadAs(tokens.cskh, 'audio/mpeg')).status, 403);
  assert.equal((await uploadAs(tokens.teacher, 'audio/mpeg')).status, 200);

  const play = (token) =>
    fetch(`${base}/calls/${callId}/recording`, { headers: { Authorization: `Bearer ${token}` } });
  const asTeacher = await play(tokens.teacher);
  assert.equal(asTeacher.status, 200);
  assert.equal(asTeacher.headers.get('content-type'), 'audio/mpeg');
  assert.equal(await asTeacher.text(), 'ID3fake-mp3-bytes');
  // Trưởng phòng / PHT hear every recording; staff and the admin only their own calls.
  assert.equal((await play(tokens.manager)).status, 200);
  assert.equal((await play(tokens.admin)).status, 403);
  assert.equal((await play(tokens.cskh)).status, 403);

  // History: your own calls; scope=all lists everyone's for those who may hear them all.
  const own = await request(`/calls?studentId=${students[0]._id}`, tokens.teacher);
  assert.equal(own.body.items[0]._id, callId);
  assert.equal(own.body.items[0].callerId.fullName, 'teacher');
  assert.equal(own.body.items[0].canPlay, true);
  for (const role of ['cskh', 'manager', 'admin']) {
    const others = await request(`/calls?studentId=${students[0]._id}`, tokens[role]);
    assert.equal(others.body.items.length, 0);
  }
  const all = await request(`/calls?scope=all&studentId=${students[0]._id}`, tokens.manager);
  assert.equal(all.body.items.length, 2);
  assert.equal(all.body.canViewAll, true);
  assert.equal(
    (await request(`/calls?scope=all&studentId=${students[0]._id}`, tokens.cskh)).body.items.length,
    0,
  );
  await CuocGoi.deleteOne({ _id: unrecorded.body.call._id });

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
      record: true,
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
  assert.ok(activity.every((d) => d.students.present >= 0 && d.created.careCases >= 0));
  const outcomes = res.body.callOutcomes;
  assert.ok(['answered', 'noAnswer', 'busy', 'unrecorded'].every((k) => outcomes[k] >= 0));
  assert.equal(typeof res.body.careCases.awaiting, 'number');
  assert.ok(res.body.warnings.items.length <= Math.min(4, res.body.warnings.count));
  assert.ok(integrations.some((g) => g.name === 'Email (SMTP)'));
  assert.equal(typeof subscription.active, 'boolean');
});

test('notifications: the bell marks everything seen, a page marks its own kind; new work shows again', async () => {
  const { staff, token } = await createTaskStaff('bell');
  const newTask = async (title) => {
    const created = await request('/tasks', tokens.manager, 'POST', {
      title,
      description: 'Nhiệm vụ để kiểm tra thông báo.',
      assignedTo: String(staff._id),
    });
    assert.equal(created.status, 201);
    await new Promise((resolve) => setTimeout(resolve, 5));
  };
  await newTask('Việc thứ nhất');
  const before = await request('/notifications', token);
  assert.equal(before.status, 200);
  assert.deepEqual(before.body.tasks, { pending: 1, new: 1 });
  assert.equal(before.body.unseen, 1);

  // Opening the bell: nothing unseen, but the work is still pending.
  const seen = await request('/notifications/seen', token, 'PUT');
  assert.equal(seen.body.unseen, 0);
  assert.deepEqual(seen.body.tasks, { pending: 1, new: 0 });

  // New work appears again; opening the care page does not clear it, the tasks page does.
  await new Promise((resolve) => setTimeout(resolve, 5));
  await newTask('Việc thứ hai');
  assert.equal((await request('/notifications', token)).body.tasks.new, 1);
  assert.equal(
    (await request('/notifications/seen', token, 'PUT', { scope: 'care' })).body.tasks.new,
    1,
  );
  const tasksSeen = await request('/notifications/seen', token, 'PUT', { scope: 'tasks' });
  assert.deepEqual(tasksSeen.body.tasks, { pending: 2, new: 0 });
  assert.equal((await request('/notifications/seen', token, 'PUT', { scope: 'x' })).status, 400);
  await NhiemVu.deleteMany({ assignedTo: staff._id });
});

test('students can be added, edited and deleted by the manager only, with cascade', async () => {
  const CuocGoi = require('../models/CuocGoi');
  const body = {
    studentCode: 'CRUD001',
    fullName: 'Nguyễn Văn A',
    classCode: 'CRUD',
    phone: '0912 345 678',
  };
  for (const token of [tokens.admin, tokens.teacher]) {
    assert.equal((await request('/students', token, 'POST', body)).status, 403);
  }
  for (const bad of [
    { ...body, fullName: '  ' },
    { ...body, phone: 'abc' },
    { ...body, classCode: 5 },
  ]) {
    assert.equal((await request('/students', tokens.manager, 'POST', bad)).status, 400);
  }
  const created = await request('/students', tokens.manager, 'POST', body);
  assert.equal(created.status, 201);
  assert.equal(created.body.phone, '0912 345 678');
  assert.equal((await request('/students', tokens.manager, 'POST', body)).status, 409);

  const id = created.body._id;
  const edited = await request(`/students/${id}`, tokens.manager, 'PUT', {
    fullName: ' Nguyễn Văn B ',
    parentPhone: '0987654321',
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.fullName, 'Nguyễn Văn B');
  assert.equal(edited.body.studentCode, 'CRUD001');
  assert.equal(
    (await request(`/students/${id}`, tokens.manager, 'PUT', { studentCode: 'TEST001' })).status,
    409,
  );

  await NhomHocPhan.updateOne({ _id: group._id }, { $push: { students: id } });
  const attendance = await DiemDanh.create({
    courseGroupId: group._id,
    absentStudents: [id],
    excusedStudents: [{ studentId: id, reason: 'x' }],
  });
  await HoSoChamSoc.create({ studentId: id, source: 'de_xuat' });
  await CuocGoi.create({
    callerId: users.manager._id,
    callerRole: 'manager',
    studentId: id,
    target: 'sinh_vien',
    phoneNumber: '0912345678',
    method: 'dien_thoai',
  });

  assert.equal((await request(`/students/${id}`, tokens.manager, 'DELETE')).status, 200);
  assert.equal(await SinhVien.countDocuments({ _id: id }), 0);
  assert.ok(!(await NhomHocPhan.findById(group._id)).students.map(String).includes(id));
  const left = await DiemDanh.findById(attendance._id);
  assert.equal(left.absentStudents.length + left.excusedStudents.length, 0);
  assert.equal(await HoSoChamSoc.countDocuments({ studentId: id }), 0);
  assert.equal(await CuocGoi.countDocuments({ studentId: id }), 0);
  assert.equal((await request(`/students/${id}`, tokens.manager, 'DELETE')).status, 404);
});

test(
  'a Trưởng phòng / PHT signs up by paying: activated with a receipt, locked when the plan ends, renewed by link',
  withFakeSmtp(async () => {
    const status = { value: 'PENDING', amount: 499000 };
    await withFakePayOS(status, async () => {
      const email = 'truongphong.moi@itc.edu.vn';
      const signup = {
        fullName: 'Trưởng Phòng Mới',
        email,
        password: 'matkhau123',
        role: 'manager',
      };
      assert.equal((await request('/auth/register', null, 'POST', signup)).status, 400);

      const registered = await request('/auth/register', null, 'POST', {
        ...signup,
        planCode: 'goi_1_thang',
      });
      assert.equal(registered.status, 201);
      assert.match(registered.body.checkoutUrl, /^https:\/\/pay\.payos\.vn\//);
      const user = await NguoiDung.findOne({ email });
      assert.equal(user.status, 'awaiting_payment');
      const order = await DonThanhToan.findOne({ account: user._id });
      assert.equal(order.kind, 'account');

      // Not paid yet: login points to the payment page instead of signing in.
      const credentials = { email, password: 'matkhau123' };
      const unpaid = await request('/auth/login', null, 'POST', credentials);
      assert.equal(unpaid.status, 403);
      assert.equal(unpaid.body.code, 'PAYMENT_REQUIRED');
      assert.match(unpaid.body.renewUrl, /\/renew\?token=/);

      // PayOS confirms the payment: the account is active and the receipt is emailed.
      status.value = 'PAID';
      const synced = await request(`/auth/account-orders/${order.orderCode}/sync`, null, 'POST');
      assert.equal(synced.body.status, 'da_thanh_toan');
      assert.ok(new Date(synced.body.accessExpiresAt) > new Date());
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.ok(sentMails.some((m) => m.to === email && /Hóa đơn/.test(m.subject)));
      const signedIn = await request('/auth/login', null, 'POST', credentials);
      assert.equal(signedIn.status, 200);
      // Own-plan orders stay out of the shared plan's history.
      const history = await request('/billing/orders', tokens.manager);
      assert.ok(!history.body.some((o) => o.orderCode === order.orderCode));

      // The plan runs out: the session stops working and login offers the renewal link.
      await NguoiDung.updateOne({ email }, { accessExpiresAt: new Date(Date.now() - 1000) });
      const me = await request('/auth/me', signedIn.body.token);
      assert.equal(me.status, 401);
      assert.equal(me.body.code, 'ACCOUNT_EXPIRED');
      const expired = await request('/auth/login', null, 'POST', credentials);
      assert.equal(expired.body.code, 'ACCOUNT_EXPIRED');
      const token = new URL(expired.body.renewUrl).searchParams.get('token');
      // A renewal link is not a sign-in token.
      assert.equal((await request('/auth/me', token)).status, 401);

      // The expiry email goes out once per expiry date, with a working renewal link.
      const { sendDueReminders } = require('../services/dichVuGiaHanTaiKhoan');
      await sendDueReminders();
      await sendDueReminders();
      const notices = sentMails.filter((m) => m.to === email && /hết hạn/.test(m.subject));
      assert.equal(notices.length, 1);
      assert.equal(tokenFromMail(email) !== null, true);

      const info = await request(`/auth/account-renewal?token=${encodeURIComponent(token)}`);
      assert.equal(info.status, 200);
      assert.doesNotMatch(info.body.email, /truongphong\.moi/);
      assert.equal((await request('/auth/account-renewal?token=sai')).status, 400);

      status.value = 'PENDING';
      const renewal = await request('/auth/account-orders', null, 'POST', {
        token,
        planCode: 'goi_1_thang',
      });
      assert.equal(renewal.status, 201);
      status.value = 'PAID';
      await request(`/auth/account-orders/${renewal.body.orderCode}/sync`, null, 'POST');
      assert.equal((await request('/auth/login', null, 'POST', credentials)).status, 200);
      await NguoiDung.deleteOne({ email });
    });
  }),
);

test(
  'units: each Trưởng phòng / PHT sees only their own unit; staff join the unit of the manager they name',
  withFakeSmtp(async () => {
    const make = async (email, role, unitId) => {
      const user = new NguoiDung({
        fullName: email.split('@')[0],
        email,
        password: await bcrypt.hash('test-password', 4),
        role,
      });
      user.unitId = unitId ?? user._id;
      return user.save();
    };
    const leadA = await make('lead-a@unit.test', 'manager');
    const leadB = await make('lead-b@unit.test', 'manager');
    const tokenA = sign(leadA);
    const tokenB = sign(leadB);

    // Students are created inside the manager's unit; the same code may exist in another unit.
    const student = { studentCode: 'UNIT001', fullName: 'SV Đơn Vị A', classCode: 'U1' };
    const createdA = await request('/students', tokenA, 'POST', student);
    assert.equal(createdA.status, 201);
    assert.equal(String(createdA.body.unitId), String(leadA._id));
    assert.equal((await request('/students', tokenB, 'POST', student)).status, 201);
    assert.equal((await request('/students', tokenA, 'POST', student)).status, 409);

    const listA = await request('/students?search=UNIT001', tokenA);
    const listB = await request('/students?search=UNIT001', tokenB);
    assert.equal(listA.body.total, 1);
    assert.equal(listB.body.total, 1);
    assert.notEqual(listA.body.items[0]._id, listB.body.items[0]._id);
    // Another unit's student cannot be opened, edited or deleted by id.
    assert.notEqual(
      (await request(`/students/${createdA.body._id}`, tokenB, 'DELETE')).status,
      200,
    );
    assert.ok(await SinhVien.exists({ _id: createdA.body._id }));
    // The admin sees every unit.
    assert.equal((await request('/students?search=UNIT001', tokens.admin)).body.total, 2);

    // Care settings are per unit: A's warning levels do not change B's.
    const levels = [{ name: 'Riêng A', unit: 'periods', threshold: 9, color: '#123456' }];
    assert.equal(
      (await request('/settings/care', tokenA, 'PUT', { warningLevels: levels })).status,
      200,
    );
    assert.equal((await request('/settings', tokenA)).body.warningLevels[0].name, 'Riêng A');
    assert.notEqual((await request('/settings', tokenB)).body.warningLevels[0].name, 'Riêng A');

    // Sign-up names the manager; only that manager is asked and can approve.
    const signup = {
      fullName: 'NV Đơn Vị B',
      email: 'staff-b@unit.test',
      password: 'secret-pass-1',
      role: 'staff',
    };
    assert.equal((await request('/auth/register', null, 'POST', signup)).status, 400);
    assert.equal(
      (
        await request('/auth/register', null, 'POST', {
          ...signup,
          managerEmail: 'khong-co@unit.test',
        })
      ).status,
      404,
    );
    const mailsBefore = sentMails.length;
    const registered = await request('/auth/register', null, 'POST', {
      ...signup,
      managerEmail: leadB.email,
    });
    assert.equal(registered.status, 201);
    const asked = sentMails.slice(mailsBefore).map((m) => m.to);
    assert.deepEqual(asked, [leadB.email]);
    const applicant = await NguoiDung.findOne({ email: signup.email });
    assert.equal(String(applicant.unitId), String(leadB._id));
    assert.ok(
      !(await request('/auth/registrations', tokenA)).body.some((r) => r.email === signup.email),
    );
    assert.equal(
      (await request(`/auth/registrations/${applicant._id}/approve`, tokenA, 'POST')).status,
      404,
    );
    assert.equal(
      (await request(`/auth/registrations/${applicant._id}/approve`, tokenB, 'POST')).status,
      200,
    );

    // Admin-created staff must name a manager and join that unit; a new manager gets a new unit.
    assert.equal(
      (
        await request('/auth/create-staff', tokens.admin, 'POST', {
          fullName: 'NV Admin Tạo',
          email: 'admin-made@unit.test',
          role: 'teacher',
        })
      ).status,
      400,
    );
    const teacher = await request('/auth/create-staff', tokens.admin, 'POST', {
      fullName: 'GV Admin Tạo',
      email: 'admin-made@unit.test',
      role: 'teacher',
      managerId: String(leadA._id),
    });
    assert.equal(teacher.status, 201);
    assert.equal(
      String((await NguoiDung.findById(teacher.body.staff.id)).unitId),
      String(leadA._id),
    );
    const lead = await request('/auth/create-staff', tokens.admin, 'POST', {
      fullName: 'Lãnh đạo Mới',
      email: 'lead-c@unit.test',
      role: 'manager',
    });
    const leadC = await NguoiDung.findById(lead.body.staff.id);
    assert.equal(String(leadC.unitId), String(leadC._id));
    assert.equal((await request('/students?search=UNIT001', sign(leadC))).body.total, 0);
    // A manager's staff list holds only their unit.
    const staffA = (await request('/auth/staff-list', tokenA)).body.map((u) => u.email);
    assert.ok(staffA.includes('admin-made@unit.test'));
    assert.ok(!staffA.includes(signup.email));

    await SinhVien.deleteMany({ studentCode: 'UNIT001' });
    await UnitConfig.deleteMany({ unitId: { $ne: null } });
    await NguoiDung.deleteMany({ email: /@unit\.test$/ });
  }),
);

test('startup conversion puts existing data in the legacy unit and gives other managers their own', async () => {
  const { assignUnits } = require('../scripts/ganDonVi');
  const legacy = await NguoiDung.create({
    fullName: 'Chi Tran',
    email: 'legacy-owner@unit.test',
    password: 'x',
    role: 'manager',
  });
  const other = await NguoiDung.create({
    fullName: 'Lãnh đạo khác',
    email: 'other-lead@unit.test',
    password: 'x',
    role: 'manager',
  });
  const orphan = await SinhVien.create({
    studentCode: 'LEG001',
    fullName: 'SV Cũ',
    classCode: 'L1',
  });
  process.env.LEGACY_UNIT_EMAIL = legacy.email;
  const saved = await Settings.findOne();
  const previous = saved?.defaultUnitId ?? null;
  await Settings.updateOne({}, { defaultUnitId: null }, { upsert: true });
  try {
    const { defaultUnitId } = await assignUnits();
    assert.equal(String(defaultUnitId), String(legacy._id));
    assert.equal(String((await NguoiDung.findById(other._id)).unitId), String(other._id));
    assert.equal(String((await SinhVien.findById(orphan._id)).unitId), String(legacy._id));
    // Running again changes nothing.
    assert.equal(String((await assignUnits()).defaultUnitId), String(legacy._id));
  } finally {
    delete process.env.LEGACY_UNIT_EMAIL;
    await Settings.updateOne({}, { defaultUnitId: previous });
    // Leave the shared fixtures as the other tests expect them: outside any unit.
    for (const model of [SinhVien, NhomHocPhan, DiemDanh, HoSoChamSoc, CuocGoi, NhiemVu])
      await model.updateMany({}, { unitId: null });
    await NguoiDung.updateMany({ email: { $not: /@unit\.test$/ } }, { unitId: null });
    await UnitConfig.deleteMany({ unitId: { $ne: null } });
    await SinhVien.deleteOne({ _id: orphan._id });
    await NguoiDung.deleteMany({ email: /@unit\.test$/ });
  }
});

test('parent alert: more than 2 absences in a week sends one Zalo message, kept in the report', async () => {
  const ThongBaoPhuHuynh = require('../models/ThongBaoPhuHuynh');
  const { checkWeeklyAbsences } = require('../services/dichVuCanhBaoPhuHuynh');
  const { dateKey: key } = require('../utils/kiemTra');
  const today = key(new Date());
  const student = students[0];
  await SinhVien.updateOne({ _id: student._id }, { parentPhone: '0912 345 678' });
  await NguoiDung.updateOne({ _id: users.teacher._id }, { phone: '0987654321' });
  // Three course groups, one absence each on the same day: 3 sessions in this week.
  const groups = await Promise.all(
    [1, 2, 3].map((i) =>
      NhomHocPhan.create({
        groupCode: `ZNS-${i}`,
        courseName: `Môn ${i}`,
        teacherId: users.teacher._id,
        students: [student._id],
      }),
    ),
  );
  const absent = (g) =>
    DiemDanh.create({ courseGroupId: g._id, sessionDay: today, absentStudents: [student._id] });
  try {
    await absent(groups[0]);
    await absent(groups[1]);
    // Two sessions: not yet.
    assert.equal((await checkWeeklyAbsences([student._id], today)).length, 0);
    await absent(groups[2]);

    // Zalo not configured: recorded for the report, nothing sent.
    const [first] = await checkWeeklyAbsences([student._id], today);
    assert.equal(first.status, 'chua_cau_hinh');
    assert.equal(first.absentCount, 3);
    assert.match(first.content, /vắng 3 buổi/);
    assert.match(first.content, /0987654321/);
    // Once per student and week.
    assert.equal((await checkWeeklyAbsences([student._id], today)).length, 0);
    assert.equal(await ThongBaoPhuHuynh.countDocuments({ studentId: student._id }), 1);

    // Report: managers and admins only.
    assert.equal((await request('/parent-alerts', tokens.teacher)).status, 403);
    const report = await request('/parent-alerts', tokens.manager);
    assert.equal(report.status, 200);
    assert.equal(report.body.items[0].studentId.studentCode, student.studentCode);
    assert.equal(report.body.counts.chua_cau_hinh, 1);

    // Configure Zalo and re-send: the access token is renewed and the new refresh token kept.
    const realFetch = globalThis.fetch;
    const calls = [];
    Object.assign(process.env, {
      ZALO_APP_ID: 'app',
      ZALO_APP_SECRET: 'secret',
      ZALO_OA_REFRESH_TOKEN: 'refresh-1',
      ZALO_ZNS_TEMPLATE_ID: '123456',
    });
    globalThis.fetch = async (url, init = {}) => {
      const target = String(url);
      if (target.startsWith('https://oauth.zaloapp.com')) {
        calls.push({ target, body: String(init.body) });
        return new Response(
          JSON.stringify({
            access_token: 'access-1',
            refresh_token: 'refresh-2',
            expires_in: '90000',
          }),
        );
      }
      if (target.startsWith('https://business.openapi.zalo.me')) {
        calls.push({ target, body: JSON.parse(init.body), token: init.headers.access_token });
        return new Response(
          JSON.stringify({ error: 0, message: 'Success', data: { msg_id: 'm-1' } }),
        );
      }
      return realFetch(url, init);
    };
    try {
      assert.equal(
        (await request(`/parent-alerts/${first._id}/resend`, tokens.teacher, 'POST')).status,
        403,
      );
      const resent = await request(`/parent-alerts/${first._id}/resend`, tokens.manager, 'POST');
      assert.equal(resent.status, 200);
      assert.equal(resent.body.alert.status, 'da_gui');
      const sent = calls.find((c) => c.target.includes('business')).body;
      assert.equal(sent.phone, '84912345678');
      assert.equal(sent.template_id, '123456');
      assert.equal(sent.template_data.so_buoi_vang, '3');
      assert.match(sent.template_data.giang_vien, /0987654321/);
      assert.equal(process.env.ZALO_OA_REFRESH_TOKEN, 'refresh-2');
      assert.equal(
        (await request(`/parent-alerts/${first._id}/resend`, tokens.manager, 'POST')).status,
        400,
      );
    } finally {
      globalThis.fetch = realFetch;
      for (const k of [
        'ZALO_APP_ID',
        'ZALO_APP_SECRET',
        'ZALO_OA_REFRESH_TOKEN',
        'ZALO_ZNS_TEMPLATE_ID',
      ])
        delete process.env[k];
      await Settings.updateOne({}, { $unset: { 'integrations.ZALO_OA_REFRESH_TOKEN': 1 } });
    }

    // A unit that switched the messages off gets none.
    await ThongBaoPhuHuynh.deleteMany({});
    await UnitConfig.updateOne({ unitId: null }, { parentAlertsEnabled: false }, { upsert: true });
    assert.equal((await checkWeeklyAbsences([student._id], today)).length, 0);
  } finally {
    await UnitConfig.updateOne({ unitId: null }, { $unset: { parentAlertsEnabled: 1 } });
    await ThongBaoPhuHuynh.deleteMany({});
    await DiemDanh.deleteMany({ courseGroupId: { $in: groups.map((g) => g._id) } });
    await NhomHocPhan.deleteMany({ _id: { $in: groups.map((g) => g._id) } });
  }
});
