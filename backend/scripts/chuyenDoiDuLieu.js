// Đưa dữ liệu từ các phiên bản cũ lên mới. An toàn khi chạy mỗi lần khởi động: sau khi
// đã chuyển đổi, không còn gì khớp tên/giá trị cũ nên mọi bước đều không làm gì.
const mongoose = require('mongoose');
const CuocGoi = require('../models/CuocGoi');
const NhiemVu = require('../models/NhiemVu');
const NhomHocPhan = require('../models/NhomHocPhan');
const SinhVien = require('../models/SinhVien');
const { TASK_STATUS_LABEL, SHIFT_LABEL, WEEKDAY_LABEL } = require('../utils/hangSo');

// 1. Tên collection tiếng Anh cũ -> tên tiếng Việt không dấu.
const LEGACY_COLLECTIONS = Object.freeze({
  attendances: 'diem_danh',
  calltasks: 'nhiem_vu_goi_dien',
  coursegroups: 'nhom_hoc_phan',
  roundrobincursors: 'con_tro_xoay_vong',
  students: 'sinh_vien',
  systemsettings: 'cai_dat_he_thong',
  tasks: 'nhiem_vu',
  users: 'nguoi_dung',
});

async function renameCollections() {
  const db = mongoose.connection.db;
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );

  for (const [legacy, name] of Object.entries(LEGACY_COLLECTIONS)) {
    if (!existing.has(legacy)) continue;
    // Mongoose có thể đã tạo collection mới (rỗng) khi dựng index.
    if (existing.has(name) && (await db.collection(name).estimatedDocumentCount()) > 0) {
      console.warn(`Skipped renaming "${legacy}": "${name}" already has data.`);
      continue;
    }
    await db.renameCollection(legacy, name, { dropTarget: true });
    console.log(`Renamed collection "${legacy}" -> "${name}".`);
  }
}

// 2. Accented enum values ('Chưa gọi', 'Sáng', 'Thứ 2'...) -> unaccented codes.
const legacyPairs = (labels) => Object.entries(labels).map(([code, label]) => [label, code]);

async function renameValues(Model, field, labels) {
  let changed = 0;
  for (const [legacy, code] of legacyPairs(labels)) {
    const { modifiedCount } = await Model.collection.updateMany(
      { [field]: legacy },
      { $set: { [field]: code } },
    );
    changed += modifiedCount;
  }
  return changed;
}

async function renameArrayValues(Model, field, labels) {
  let changed = 0;
  for (const [legacy, code] of legacyPairs(labels)) {
    const { modifiedCount } = await Model.collection.updateMany(
      { [field]: legacy },
      { $set: { [`${field}.$[v]`]: code } },
      { arrayFilters: [{ v: legacy }] },
    );
    changed += modifiedCount;
  }
  return changed;
}

async function migrateEnumCodes() {
  const counts = await Promise.all([
    renameValues(NhiemVu, 'status', TASK_STATUS_LABEL),
    renameValues(NhomHocPhan, 'shift', SHIFT_LABEL),
    renameArrayValues(NhomHocPhan, 'scheduleDays', WEEKDAY_LABEL),
  ]);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total) console.log(`Migrated ${total} documents to unaccented enum codes.`);
}

// 3. Mã lớp được so khớp ở dạng chữ hoa (phân công lớp, phạm vi nhân viên); sửa các bản ghi cũ.
async function normalizeClassCodes() {
  const { modifiedCount } = await SinhVien.collection.updateMany(
    { classCode: { $type: 'string', $regex: /(^\s|\s$|[a-z])/ } },
    [{ $set: { classCode: { $toUpper: { $trim: { input: '$classCode' } } } } }],
  );
  if (modifiedCount) console.log(`Normalized the class code of ${modifiedCount} students.`);
}

// 4. Các cuộc gọi từ trước khi có câu hỏi "ghi âm?" luôn được ghi âm; giữ cho vẫn phát được.
async function markLegacyRecordings() {
  const { modifiedCount } = await CuocGoi.collection.updateMany(
    {
      record: { $exists: false },
      $or: [{ recording: { $ne: null } }, { stringeeCallId: { $nin: ['', null] } }],
    },
    { $set: { record: true } },
  );
  if (modifiedCount) console.log(`Marked ${modifiedCount} earlier calls as recorded.`);
}

module.exports = async function migrateLegacyData() {
  await renameCollections();
  await migrateEnumCodes();
  await normalizeClassCodes();
  await markLegacyRecordings();
};
