const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const DiemDanh = require('../models/DiemDanh');
const HoSoChamSoc = require('../models/HoSoChamSoc');
const CuocGoi = require('../models/CuocGoi');
const {
  verifyToken,
  requirePermission,
  requireSignedIn,
  requireOperator,
} = require('../middleware/xacThuc');
const { requireStudentAccess } = require('../middleware/phanQuyen');
const { toLabel } = require('../utils/hangSo');
const { assert, validateId, normalizeClass } = require('../utils/kiemTra');
const { getUploadDir } = require('../utils/moiTruong');

const MAX_PAGE_SIZE = 100;

// GET /api/students (Admin, Trưởng phòng/Phó hiệu trưởng) — every student's record.
// Query: search (code / name / phone), classCode, page, limit.
router.get('/', verifyToken, requirePermission('students.view'), async (req, res, next) => {
  try {
    const { search, classCode } = req.query;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), MAX_PAGE_SIZE);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const filter = {};
    if (typeof classCode === 'string' && classCode) filter.classCode = normalizeClass(classCode);
    if (typeof search === 'string' && search.trim()) {
      const pattern = { $regex: RegExp.escape(search.trim()), $options: 'i' };
      filter.$or = [
        { studentCode: pattern },
        { fullName: pattern },
        { phone: pattern },
        { parentPhone: pattern },
      ];
    }

    const [items, total] = await Promise.all([
      SinhVien.find(filter)
        .sort({ classCode: 1, studentCode: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      SinhVien.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  } catch (error) {
    next(error);
  }
});

// GET /api/students/classes (Admin, Trưởng phòng) — class codes for the filter dropdown.
router.get('/classes', verifyToken, requirePermission('students.view'), async (req, res, next) => {
  try {
    res.json((await SinhVien.distinct('classCode')).filter(Boolean).sort());
  } catch (error) {
    next(error);
  }
});

// Editable fields of a student record; courseGroups and tags are managed elsewhere.
const FIELDS = Object.freeze({
  studentCode: { label: 'MSSV', required: true, max: 30 },
  fullName: { label: 'Họ và tên', required: true, max: 100 },
  classCode: { label: 'Lớp', required: true, max: 30 },
  dob: { label: 'Ngày sinh', max: 20 },
  major: { label: 'Ngành', max: 100 },
  phone: { label: 'SĐT sinh viên', max: 20, phone: true },
  parentPhone: { label: 'SĐT phụ huynh', max: 20, phone: true },
});

/** Validates and trims the body; `partial` (update) skips fields that were left out. */
function studentData(body, partial) {
  assert(body && typeof body === 'object' && !Array.isArray(body), 'Dữ liệu không hợp lệ');
  const data = {};
  for (const [key, rule] of Object.entries(FIELDS)) {
    if (partial && body[key] === undefined) continue;
    const value = body[key] ?? '';
    assert(typeof value === 'string', `${rule.label} không hợp lệ`);
    const trimmed = value.trim();
    assert(!rule.required || trimmed, `Vui lòng nhập ${rule.label}`);
    assert(trimmed.length <= rule.max, `${rule.label} quá dài`);
    assert(
      !rule.phone || !trimmed || /^\+?[\d\s.-]{8,20}$/.test(trimmed),
      `${rule.label} không hợp lệ`,
    );
    data[key] = trimmed;
  }
  return data;
}

async function assertCodeFree(studentCode, exceptId) {
  const taken = await SinhVien.exists({ studentCode, _id: { $ne: exceptId } });
  assert(!taken, `MSSV ${studentCode} đã tồn tại`, 409);
}

// POST /api/students (quyền excel.import — quản lý dữ liệu sinh viên) — add one student.
router.post('/', verifyToken, requirePermission('excel.import'), async (req, res, next) => {
  try {
    const data = studentData(req.body, false);
    await assertCodeFree(data.studentCode);
    res.status(201).json(await SinhVien.create(data));
  } catch (error) {
    next(error);
  }
});

// PUT /api/students/:id — edit a student's details.
router.put('/:id', verifyToken, requirePermission('excel.import'), async (req, res, next) => {
  try {
    validateId(req.params.id);
    const data = studentData(req.body, true);
    if (data.studentCode) await assertCodeFree(data.studentCode, req.params.id);
    const student = await SinhVien.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });
    assert(student, 'Không tìm thấy sinh viên', 404);
    res.json(student);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/students/:id — removes the student with their course memberships, attendance
// marks, call tasks and call logs (including recording files).
router.delete('/:id', verifyToken, requirePermission('excel.import'), async (req, res, next) => {
  try {
    validateId(req.params.id);
    const student = await SinhVien.findByIdAndDelete(req.params.id);
    assert(student, 'Không tìm thấy sinh viên', 404);
    const calls = await CuocGoi.find({ studentId: student._id }).select('recording').lean();
    await Promise.all([
      NhomHocPhan.updateMany({ students: student._id }, { $pull: { students: student._id } }),
      DiemDanh.updateMany(
        {},
        {
          $pull: {
            absentStudents: student._id,
            excusedStudents: { studentId: student._id },
          },
        },
      ),
      HoSoChamSoc.deleteMany({ studentId: student._id }),
      CuocGoi.deleteMany({ studentId: student._id }),
    ]);
    const recordingDir = path.join(getUploadDir(), 'recordings');
    for (const { recording } of calls)
      if (recording?.storedName) fs.unlink(path.join(recordingDir, recording.storedName), () => {});
    res.json({ message: `Đã xóa sinh viên ${student.fullName}` });
  } catch (error) {
    next(error);
  }
});

// GET /api/students/:studentId/profile — 360° timeline: absences, care cases and calls.
router.get(
  '/:studentId/profile',
  verifyToken,
  requireSignedIn,
  requireStudentAccess,
  async (req, res, next) => {
    try {
      const { student } = req; // loaded and access-checked by requireStudentAccess
      const [attendanceRecords, cases, calls] = await Promise.all([
        DiemDanh.find({
          $or: [{ absentStudents: student._id }, { 'excusedStudents.studentId': student._id }],
        })
          .populate('courseGroupId', 'groupCode courseName')
          .populate('recordedBy', 'fullName email')
          .sort({ date: -1 }),
        HoSoChamSoc.find({ studentId: student._id })
          .select(
            'status source reason cause solution assignedStaffId steps.done closing createdAt',
          )
          .populate('assignedStaffId', 'fullName email')
          .sort({ createdAt: -1 })
          .lean(),
        CuocGoi.find({ studentId: student._id })
          .select('callerId target outcome note durationSec careCaseId createdAt')
          .populate('callerId', 'fullName role')
          .sort({ createdAt: -1 })
          .limit(50)
          .lean(),
      ]);
      const sid = student._id.toString();
      const timeline = [
        ...cases.map((c) => ({
          type: 'care_case',
          date: c.createdAt,
          title: `Hồ sơ chăm sóc: ${toLabel(c.status)}`,
          caseId: c._id,
          staff: c.assignedStaffId,
          status: c.status,
          note: [
            c.reason,
            c.cause && `Nguyên nhân: ${c.cause}`,
            c.solution && `Hướng giải quyết: ${c.solution}`,
          ]
            .filter(Boolean)
            .join(' · '),
          stepsDone: c.steps.filter((st) => st.done).length,
          stepsTotal: c.steps.length,
        })),
        ...calls.map((c) => ({
          type: 'call',
          date: c.createdAt,
          title: `Cuộc gọi ${c.target === 'phu_huynh' ? 'phụ huynh' : 'sinh viên'}`,
          staff: c.callerId,
          status: c.outcome,
          note: c.note,
          caseId: c.careCaseId,
        })),
        ...attendanceRecords.map((att) => {
          const isAbsent = att.absentStudents.some((id) => id.toString() === sid);
          const excusedItem = att.excusedStudents.find(
            (item) => item.studentId?.toString() === sid,
          );
          return {
            type: 'attendance',
            date: att.date,
            title: isAbsent ? 'Báo Vắng Học' : 'Vắng Có Lý Do',
            courseGroup: att.courseGroupId,
            staff: att.recordedBy,
            status: isAbsent ? 'Vắng' : 'Có lý do',
            note: excusedItem ? excusedItem.reason : '',
          };
        }),
      ].sort((a, b) => new Date(b.date) - new Date(a.date));

      res.json({
        student,
        timeline,
        totalAbsences: attendanceRecords.filter((att) =>
          att.absentStudents.some((id) => id.toString() === sid),
        ).length,
        totalCalls: calls.length,
        totalCases: cases.length,
      });
    } catch (error) {
      next(error);
    }
  },
);

// PUT /api/students/:studentId/tags — body { tags: string[] }.
router.put(
  '/:studentId/tags',
  verifyToken,
  requireOperator,
  requireStudentAccess,
  async (req, res, next) => {
    try {
      const { tags } = req.body ?? {};
      assert(
        Array.isArray(tags) && tags.every((tag) => typeof tag === 'string'),
        'Thẻ nhãn phải là một mảng',
      );
      req.student.tags = tags;
      await req.student.save();
      res.json({ message: 'Cập nhật thẻ nhãn thành công!', tags: req.student.tags });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
