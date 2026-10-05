// Phân công lớp hành chính cho nhân viên CSSV, có lưu lịch sử.
// Nguồn sự thật cho "ai đang phụ trách lớp nào" là bản ghi LichSuPhanCong đang active; trường
// NguoiDung.managedClasses được giữ đồng bộ để kiểm tra quyền nhanh.
const LichSuPhanCong = require('../models/LichSuPhanCong');
const NguoiDung = require('../models/NguoiDung');
const SinhVien = require('../models/SinhVien');
const { assert, normalizeClass } = require('../utils/kiemTra');

/**
 * Đồng bộ lịch sử với managedClasses cho dữ liệu tạo trước khi có lịch sử:
 * mỗi lớp một nhân viên phụ trách đều có một bản ghi đang hiệu lực (xung đột thì người đầu tiên thắng).
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
      if (holder && holder !== String(staff._id)) continue; // người khác đang giữ lớp
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

/** Nhân viên đang hoạt động phụ trách một lớp, hoặc null. */
async function staffForClass(classCode) {
  const record = await LichSuPhanCong.findOne({
    classCode: normalizeClass(classCode),
    active: true,
  });
  if (!record) return null;
  return NguoiDung.findOne({ _id: record.staffId, role: 'staff', status: 'active' });
}

/**
 * Giao `classCode` cho `staffId` (hoặc cho không ai khi staffId là null), đóng
 * phân công trước đó. Các hồ sơ chăm sóc đang mở của sinh viên lớp mà người cũ giữ sẽ chuyển theo lớp;
 * nếu không ai được giao thì chờ chỉ đạo của quản lý.
 */
async function assignClass({ classCode, staffId, by, reason = '' }) {
  const code = normalizeClass(classCode);
  assert(code, 'Thiếu mã lớp');
  let staff = null;
  if (staffId) {
    staff = await NguoiDung.findById(staffId);
    assert(
      staff && staff.role === 'staff' && staff.status === 'active',
      'Chỉ giao lớp cho nhân viên CSSV đang hoạt động',
    );
  }
  const current = await LichSuPhanCong.findOne({ classCode: code, active: true });
  if (current && staff && String(current.staffId) === String(staff._id))
    return { classCode: code, staff, movedCases: 0, unchanged: true };

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
  // Bắt buộc ở đây: chính service hồ sơ chăm sóc cần staffForClass từ module này.
  const { moveClassCases } = require('./dichVuHoSoChamSoc');
  const movedCases = await moveClassCases(studentIds, current?.staffId, staff);
  return { classCode: code, staff, movedCases };
}

/** Giải phóng mọi lớp của một nhân viên (tài khoản bị khóa / xóa); hồ sơ của họ quay về
 *  quản lý. */
async function releaseStaffClasses(staff, by, reason) {
  const records = await LichSuPhanCong.find({ staffId: staff._id, active: true });
  let movedCases = 0;
  for (const record of records) {
    movedCases += (await assignClass({ classCode: record.classCode, staffId: null, by, reason }))
      .movedCases;
  }
  // Các hồ sơ ngoài mọi lớp của họ (quản lý chỉ đạo riêng cho họ) cũng quay về.
  const { releaseStaffCases } = require('./dichVuHoSoChamSoc');
  movedCases += await releaseStaffCases(staff._id);
  return { releasedClasses: records.length, movedCases };
}

module.exports = {
  normalizeClass,
  syncLegacyAssignments,
  staffForClass,
  assignClass,
  releaseStaffClasses,
};
