const express = require('express');
const router = express.Router();
const SinhVien = require('../models/SinhVien');
const { verifyToken, requireManagement } = require('../middleware/xacThuc');

const MAX_PAGE_SIZE = 100;

// GET /api/students (Admin, Trưởng phòng/Phó hiệu trưởng) — every student's record.
// Query: search (code / name / phone), classCode, page, limit.
router.get('/', verifyToken, requireManagement, async (req, res, next) => {
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
router.get('/classes', verifyToken, requireManagement, async (req, res, next) => {
  try {
    res.json((await SinhVien.distinct('classCode')).filter(Boolean).sort());
  } catch (error) {
    next(error);
  }
});

module.exports = router;
