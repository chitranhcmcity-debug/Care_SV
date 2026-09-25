const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const DiemDanh = require('../models/DiemDanh');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const CuocGoi = require('../models/CuocGoi');
const { verifyToken, requirePermission } = require('../middleware/xacThuc');
const { assert, validateId } = require('../utils/kiemTra');
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
    if (typeof classCode === 'string' && classCode) filter.classCode = classCode;
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
      NhiemVuGoiDien.deleteMany({ studentId: student._id }),
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

module.exports = router;
