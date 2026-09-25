// Phân công lớp hành chính cho nhân viên CSKH, có lưu lịch sử.
// Nguồn sự thật cho "ai đang phụ trách lớp nào" là bản ghi LichSuPhanCong đang active; trường
// NguoiDung.managedClasses được giữ đồng bộ để kiểm tra quyền nhanh.
const LichSuPhanCong = require('../models/LichSuPhanCong');
const NguoiDung = require('../models/NguoiDung');
const SinhVien = require('../models/SinhVien');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const { assert } = require('../utils/kiemTra');
const { OPEN_CALL_STATUSES } = require('../utils/hangSo');

const normalizeClass = (code) =>
  String(code || '')
    .trim()
    .toUpperCase();

/**
 * Brings history in line with managedClasses for data created before history existed:
 * every class a staff member manages gets an active record (first holder wins on conflicts).
 */
async function syncLegacyAssignments() {
  const staffs = await NguoiDung.find({ role: 'staff', managedClasses: { $ne: [] } }).sort({
    _id: 1,
  });
  if (!staffs.length) return;
  const active = new Map(
    (await LichSuPhanCong.find({ active: true }).lean()).map((r) => [
      r.classCode,
      String(r.staffId),
    ]),
  );
  for (const staff of staffs) {
    const keep = [];
    for (const raw of staff.managedClasses) {
      const code = normalizeClass(raw);
      const holder = active.get(code);
      if (holder && holder !== String(staff._id)) continue; // someone else holds it
      if (!holder) {
        await LichSuPhanCong.create({
          classCode: code,
          staffId: staff._id,
          staffName: staff.fullName,
          startedAt: staff.updatedAt || new Date(),
        });
        active.set(code, String(staff._id));
      }
      if (!keep.includes(code)) keep.push(code);
    }
    if (keep.length !== staff.managedClasses.length) {
      staff.managedClasses = keep;
      await staff.save();
    }
  }
}

/** Active staff member responsible for a class, or null. */
async function staffForClass(classCode) {
  const record = await LichSuPhanCong.findOne({
    classCode: normalizeClass(classCode),
    active: true,
  });
  if (!record) return null;
  return NguoiDung.findOne({ _id: record.staffId, role: 'staff', status: 'active' });
}

/**
 * Gives `classCode` to `staffId` (or to nobody when staffId is null), closing the previous
 * assignment. Open call tasks of the class's students follow the class; with nobody assigned they
 * go to the manager's queue (assignedStaffId = null).
 */
async function assignClass({ classCode, staffId, by, reason = '' }) {
  const code = normalizeClass(classCode);
  assert(code, 'Thiếu mã lớp');
  let staff = null;
  if (staffId) {
    staff = await NguoiDung.findById(staffId);
    assert(
      staff && staff.role === 'staff' && staff.status === 'active',
      'Chỉ giao lớp cho nhân viên CSKH đang hoạt động',
    );
  }
  const current = await LichSuPhanCong.findOne({ classCode: code, active: true });
  if (current && staff && String(current.staffId) === String(staff._id))
    return { classCode: code, staff, movedTasks: 0, unchanged: true };

  if (current) {
    Object.assign(current, {
      active: false,
      endedAt: new Date(),
      endedBy: by || null,
      endReason: reason || (staff ? `Chuyển cho ${staff.fullName}` : 'Thu hồi phân công'),
    });
    await current.save();
    await NguoiDung.updateOne({ _id: current.staffId }, { $pull: { managedClasses: code } });
  }
  if (staff) {
    await LichSuPhanCong.create({
      classCode: code,
      staffId: staff._id,
      staffName: staff.fullName,
      assignedBy: by || null,
    });
    await NguoiDung.updateOne({ _id: staff._id }, { $addToSet: { managedClasses: code } });
  }

  const studentIds = (await SinhVien.find({ classCode: code }).select('_id')).map((s) => s._id);
  const moved = studentIds.length
    ? await NhiemVuGoiDien.updateMany(
        { studentId: { $in: studentIds }, status: { $in: OPEN_CALL_STATUSES } },
        { assignedStaffId: staff ? staff._id : null },
      )
    : { modifiedCount: 0 };
  return { classCode: code, staff, movedTasks: moved.modifiedCount || 0 };
}

/** Releases every class of a staff member (account locked / deleted); tasks go to the queue. */
async function releaseStaffClasses(staff, by, reason) {
  const records = await LichSuPhanCong.find({ staffId: staff._id, active: true });
  let movedTasks = 0;
  for (const record of records) {
    movedTasks += (await assignClass({ classCode: record.classCode, staffId: null, by, reason }))
      .movedTasks;
  }
  // Tasks outside any class of theirs (e.g. created before class assignment) also go to the queue.
  const leftover = await NhiemVuGoiDien.updateMany(
    { assignedStaffId: staff._id, status: { $in: OPEN_CALL_STATUSES } },
    { assignedStaffId: null },
  );
  return {
    releasedClasses: records.length,
    movedTasks: movedTasks + (leftover.modifiedCount || 0),
  };
}

module.exports = {
  normalizeClass,
  syncLegacyAssignments,
  staffForClass,
  assignClass,
  releaseStaffClasses,
};
