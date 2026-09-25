const express = require('express');
const router = express.Router();
const NguoiDung = require('../models/NguoiDung');
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const DiemDanh = require('../models/DiemDanh');
const CuocGoi = require('../models/CuocGoi');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const subscription = require('../services/dichVuGoiDichVu');
const payos = require('../services/dichVuPayOS');
const { describeIntegrations } = require('../services/dichVuCauHinhApi');
const { verifyToken, requireAdmin } = require('../middleware/xacThuc');
const { CALL_STATUS, OPEN_CALL_STATUSES } = require('../utils/hangSo');

const DAYS = 7;
const TIMEZONE = 'Asia/Ho_Chi_Minh';
const dayKey = (date) => date.toLocaleDateString('en-CA', { timeZone: TIMEZONE }); // YYYY-MM-DD

/** Documents created per day since `since`, as { 'YYYY-MM-DD': count }. */
async function perDay(Model, since) {
  const rows = await Model.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TIMEZONE } },
        count: { $sum: 1 },
      },
    },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r.count]));
}

const countBy = async (field) =>
  Object.fromEntries(
    (await NguoiDung.aggregate([{ $group: { _id: `$${field}`, count: { $sum: 1 } } }])).map((r) => [
      r._id,
      r.count,
    ]),
  );

/** An integration group is ready when every key without a built-in default has a value. */
function integrationStatus() {
  const groups = new Map();
  for (const item of describeIntegrations()) {
    const ready = groups.get(item.group) ?? true;
    groups.set(item.group, ready && (Boolean(item.placeholder) || item.source !== 'none'));
  }
  return [...groups].map(([name, configured]) => ({ name, configured }));
}

// GET /api/overview (Admin) — system health at a glance. Mounted outside the subscription lock
// so the admin still sees it (and the renewal state) after the subscription expires.
router.get('/', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const today = new Date();
    const since = new Date(today);
    since.setDate(since.getDate() - (DAYS - 1));
    since.setHours(0, 0, 0, 0);

    const [
      sub,
      byRole,
      byStatus,
      recentUsers,
      students,
      classCodes,
      courseGroups,
      groupsWithoutTeacher,
      assignedClasses,
      openCallTasks,
      contactedCallTasks,
      attendanceByDay,
      callsByDay,
      callsWithRecording,
    ] = await Promise.all([
      subscription.getSubscription(),
      countBy('role'),
      countBy('status'),
      NguoiDung.find()
        .select('fullName email role status createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      SinhVien.countDocuments(),
      SinhVien.distinct('classCode'),
      NhomHocPhan.countDocuments(),
      NhomHocPhan.countDocuments({ teacherId: null }),
      NguoiDung.distinct('managedClasses', { role: 'staff', status: 'active' }),
      NhiemVuGoiDien.countDocuments({ status: { $in: OPEN_CALL_STATUSES } }),
      NhiemVuGoiDien.countDocuments({ status: CALL_STATUS.CONTACTED }),
      perDay(DiemDanh, since),
      perDay(CuocGoi, since),
      CuocGoi.countDocuments({
        createdAt: { $gte: since },
        'recording.storedName': { $exists: true },
      }),
    ]);

    const assigned = new Set(assignedClasses);
    const activity = Array.from({ length: DAYS }, (_, i) => {
      const day = new Date(since);
      day.setDate(since.getDate() + i);
      const key = dayKey(day);
      return { date: key, attendance: attendanceByDay[key] || 0, calls: callsByDay[key] || 0 };
    });

    res.json({
      subscription: { ...sub, payosConfigured: payos.isConfigured() },
      users: {
        total: Object.values(byRole).reduce((a, b) => a + b, 0),
        byRole,
        byStatus,
        recent: recentUsers,
      },
      data: {
        students,
        classes: classCodes.length,
        classesWithoutStaff: classCodes.filter((c) => !assigned.has(c)).length,
        courseGroups,
        groupsWithoutTeacher,
      },
      callTasks: { open: openCallTasks, contacted: contactedCallTasks },
      activity,
      callsWithRecording,
      integrations: integrationStatus(),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
