const express = require('express');
const router = express.Router();
const NguoiDung = require('../models/NguoiDung');
const SinhVien = require('../models/SinhVien');
const LichSuPhanCong = require('../models/LichSuPhanCong');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const { verifyToken, requirePermission } = require('../middleware/xacThuc');
const { assert, validateId } = require('../utils/kiemTra');
const { OPEN_CALL_STATUSES } = require('../utils/hangSo');
const {
  normalizeClass,
  syncLegacyAssignments,
  assignClass,
} = require('../services/dichVuPhanCongLop');

// Reading is open to anyone who oversees care work (admin can view); changes need classes.assign.
const canRead = requirePermission('classes.assign', 'callTasks.viewAll');
const canWrite = requirePermission('classes.assign');
router.use(verifyToken);

// GET /api/class-assignments — every administrative class with its current staff, plus staff
// workload and the size of the unassigned call queue.
router.get('/', canRead, async (req, res, next) => {
  try {
    await syncLegacyAssignments();
    const [classCounts, active, staffs, openByStaff, queueCount] = await Promise.all([
      SinhVien.aggregate([
        { $match: { classCode: { $nin: ['', null] } } },
        { $group: { _id: { $toUpper: '$classCode' }, students: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      LichSuPhanCong.find({ active: true }).lean(),
      NguoiDung.find({ role: 'staff' }).select('fullName email status managedClasses').sort({
        fullName: 1,
      }),
      NhiemVuGoiDien.aggregate([
        { $match: { status: { $in: OPEN_CALL_STATUSES }, assignedStaffId: { $ne: null } } },
        { $group: { _id: '$assignedStaffId', count: { $sum: 1 } } },
      ]),
      NhiemVuGoiDien.countDocuments({ assignedStaffId: null, status: { $in: OPEN_CALL_STATUSES } }),
    ]);
    const activeMap = new Map(active.map((r) => [r.classCode, r]));
    const openMap = new Map(openByStaff.map((o) => [String(o._id), o.count]));
    res.json({
      classes: classCounts.map((c) => {
        const record = activeMap.get(c._id);
        return {
          classCode: c._id,
          studentCount: c.students,
          staff: record ? { _id: record.staffId, fullName: record.staffName } : null,
          since: record?.startedAt || null,
        };
      }),
      staffs: staffs.map((s) => ({
        _id: s._id,
        fullName: s.fullName,
        email: s.email,
        status: s.status,
        managedClasses: s.managedClasses,
        openTasks: openMap.get(String(s._id)) || 0,
      })),
      unassignedQueue: queueCount,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/class-assignments/history?classCode=&staffId= — assignment history, newest first.
router.get('/history', canRead, async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.classCode) filter.classCode = normalizeClass(req.query.classCode);
    if (req.query.staffId) {
      validateId(req.query.staffId);
      filter.staffId = req.query.staffId;
    }
    const history = await LichSuPhanCong.find(filter)
      .populate('assignedBy', 'fullName')
      .populate('endedBy', 'fullName')
      .sort({ startedAt: -1 })
      .limit(500)
      .lean();
    res.json(history);
  } catch (error) {
    next(error);
  }
});

// PUT /api/class-assignments/:classCode — body { staffId } (null/'' = thu hồi, về hàng chờ).
router.put('/:classCode', canWrite, async (req, res, next) => {
  try {
    const staffId = req.body?.staffId || null;
    if (staffId) validateId(staffId);
    const code = normalizeClass(req.params.classCode);
    assert(await SinhVien.exists({ classCode: code }), 'Lớp không có sinh viên nào', 404);
    const result = await assignClass({
      classCode: code,
      staffId,
      by: req.user.id,
      reason: req.body?.reason,
    });
    res.json({
      message: result.unchanged
        ? `Lớp ${code} đã do ${result.staff.fullName} phụ trách.`
        : result.staff
          ? `Đã giao lớp ${code} cho ${result.staff.fullName} (${result.movedTasks} cuộc gọi đang mở chuyển theo).`
          : `Đã thu hồi phân công lớp ${code}; ${result.movedTasks} cuộc gọi đang mở về hàng chờ.`,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/class-assignments/transfer — body { fromStaffId, toStaffId, classCodes? } bàn giao
// (mặc định toàn bộ lớp) từ nhân viên này sang nhân viên khác.
router.post('/transfer', canWrite, async (req, res, next) => {
  try {
    const { fromStaffId, toStaffId, classCodes } = req.body ?? {};
    validateId(fromStaffId);
    validateId(toStaffId);
    assert(fromStaffId !== toStaffId, 'Nhân viên chuyển giao và tiếp nhận phải khác nhau');
    const from = await NguoiDung.findById(fromStaffId);
    assert(from && from.role === 'staff', 'Không tìm thấy nhân viên chuyển giao', 404);
    const codes =
      Array.isArray(classCodes) && classCodes.length
        ? classCodes.map(normalizeClass)
        : [...from.managedClasses];
    assert(codes.length, 'Không có lớp nào để bàn giao');
    assert(
      codes.every((c) => from.managedClasses.includes(c)),
      'Nhân viên chuyển giao không phụ trách các lớp này',
    );
    let movedTasks = 0;
    let toStaff = null;
    for (const classCode of codes) {
      const result = await assignClass({
        classCode,
        staffId: toStaffId,
        by: req.user.id,
        reason: req.body?.reason || 'Bàn giao lớp',
      });
      movedTasks += result.movedTasks;
      toStaff = result.staff;
    }
    res.json({
      message: `Đã bàn giao ${codes.length} lớp (${codes.join(', ')}) và ${movedTasks} cuộc gọi đang mở từ ${from.fullName} sang ${toStaff.fullName}.`,
      transferredClasses: codes,
      reassignedTaskCount: movedTasks,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
