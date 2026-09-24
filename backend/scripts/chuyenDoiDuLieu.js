// Brings data from older versions up to date. Safe to run on every startup: once
// converted, nothing matches the legacy names/values and every step is a no-op.
const mongoose = require('mongoose');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const NhiemVu = require('../models/NhiemVu');
const NhomHocPhan = require('../models/NhomHocPhan');
const {
  CALL_STATUS_LABEL,
  TASK_STATUS_LABEL,
  SHIFT_LABEL,
  WEEKDAY_LABEL,
} = require('../utils/hangSo');

// 1. Old English collection names -> unaccented Vietnamese names.
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
    // Mongoose may already have created the new collection (empty) while building indexes.
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
    renameValues(NhiemVuGoiDien, 'status', CALL_STATUS_LABEL),
    renameValues(NhiemVu, 'status', TASK_STATUS_LABEL),
    renameValues(NhomHocPhan, 'shift', SHIFT_LABEL),
    renameArrayValues(NhomHocPhan, 'scheduleDays', WEEKDAY_LABEL),
  ]);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total) console.log(`Migrated ${total} documents to unaccented enum codes.`);
}

module.exports = async function migrateLegacyData() {
  await renameCollections();
  await migrateEnumCodes();
};
