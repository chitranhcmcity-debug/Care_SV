// Báo cáo tin Zalo cảnh báo vắng đã gửi phụ huynh (xem services/dichVuCanhBaoPhuHuynh.js).
const express = require('express');
const router = express.Router();
const ThongBaoPhuHuynh = require('../models/ThongBaoPhuHuynh');
const { resend } = require('../services/dichVuCanhBaoPhuHuynh');
const { verifyToken, requireRoles } = require('../middleware/xacThuc');
const { assert, validateId } = require('../utils/kiemTra');
const { PARENT_ALERT_STATUS, PARENT_ALERT_STATUSES } = require('../utils/hangSo');

const PAGE_SIZE = 20;

// GET /api/parent-alerts?status=&page= (Trưởng phòng / PHT: their unit; Admin: every unit)
router.get('/', verifyToken, requireRoles('manager', 'admin'), async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const filter = PARENT_ALERT_STATUSES.includes(req.query.status)
      ? { status: req.query.status }
      : {};
    const [items, total, counts] = await Promise.all([
      ThongBaoPhuHuynh.find(filter)
        .populate('studentId', 'fullName studentCode classCode')
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      ThongBaoPhuHuynh.countDocuments(filter),
      ThongBaoPhuHuynh.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    res.json({
      items,
      total,
      page,
      pageSize: PAGE_SIZE,
      counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/parent-alerts/:id/resend (Trưởng phòng / PHT) — retries one that did not go through.
router.post('/:id/resend', verifyToken, requireRoles('manager'), async (req, res, next) => {
  try {
    validateId(req.params.id);
    const alert = await ThongBaoPhuHuynh.findById(req.params.id);
    assert(alert, 'Không tìm thấy tin nhắn', 404);
    assert(alert.status !== PARENT_ALERT_STATUS.SENT, 'Tin này đã gửi thành công');
    const updated = await resend(alert);
    res.json({
      message:
        updated.status === PARENT_ALERT_STATUS.SENT
          ? 'Đã gửi lại tin cho phụ huynh.'
          : 'Chưa gửi được, xem lý do trong báo cáo.',
      alert: await updated.populate('studentId', 'fullName studentCode classCode'),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
