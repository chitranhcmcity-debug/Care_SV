const NguoiDung = require('../models/NguoiDung');
const SinhVien = require('../models/SinhVien');
const LichSuPhanCong = require('../models/LichSuPhanCong');
const HoSoChamSoc = require('../models/HoSoChamSoc');
const { assert, validateId } = require('../utils/kiemTra');
const { CARE_STATUS, OPEN_CARE_STATUSES } = require('../utils/hangSo');
const {
  normalizeClass,
  syncLegacyAssignments,
  assignClass,
} = require('../services/dichVuPhanCongLop');

async function listAssignments(req, res, next) {
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
      HoSoChamSoc.aggregate([
        { $match: { status: { $in: [...OPEN_CARE_STATUSES] }, assignedStaffId: { $ne: null } } },
        { $group: { _id: '$assignedStaffId', count: { $sum: 1 } } },
      ]),
      HoSoChamSoc.countDocuments({ status: CARE_STATUS.AWAITING }),
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
        openCases: openMap.get(String(s._id)) || 0,
      })),
      awaitingCases: queueCount,
    });
  } catch (error) {
    next(error);
  }
}

async function listHistory(req, res, next) {
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
}

async function assign(req, res, next) {
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
          ? `Đã giao lớp ${code} cho ${result.staff.fullName} (${result.movedCases} hồ sơ chăm sóc đang mở chuyển theo).`
          : `Đã thu hồi phân công lớp ${code}; ${result.movedCases} hồ sơ chăm sóc chờ chỉ đạo.`,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

async function transfer(req, res, next) {
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
    let movedCases = 0;
    let toStaff = null;
    for (const classCode of codes) {
      const result = await assignClass({
        classCode,
        staffId: toStaffId,
        by: req.user.id,
        reason: req.body?.reason || 'Bàn giao lớp',
      });
      movedCases += result.movedCases;
      toStaff = result.staff;
    }
    res.json({
      message: `Đã bàn giao ${codes.length} lớp (${codes.join(', ')}) và ${movedCases} hồ sơ chăm sóc đang mở từ ${from.fullName} sang ${toStaff.fullName}.`,
      transferredClasses: codes,
      reassignedCaseCount: movedCases,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { listAssignments, listHistory, assign, transfer };
