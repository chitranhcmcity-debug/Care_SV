// Puts every account and record into a unit (đơn vị). Safe to run on every startup.
// - Each Trưởng phòng / PHT owns their own unit (unitId = their _id).
// - The default unit belongs to LEGACY_UNIT_EMAIL (or the oldest manager): it keeps the data from
//   before units existed, the staff and teachers without a unit, and the old care settings.
// - Anything still without a unit (e.g. demo data seeded at startup) joins the default unit.
const CaiDatHeThong = require('../models/CaiDatHeThong');
const CauHinhDonVi = require('../models/CauHinhDonVi');
const NguoiDung = require('../models/NguoiDung');
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const DiemDanh = require('../models/DiemDanh');
const HoSoChamSoc = require('../models/HoSoChamSoc');
const CuocGoi = require('../models/CuocGoi');
const NhiemVu = require('../models/NhiemVu');
const LichSuPhanCong = require('../models/LichSuPhanCong');

const LEGACY_UNIT_EMAIL = () =>
  (process.env.LEGACY_UNIT_EMAIL || 'chitran15111996@gmail.com').trim().toLowerCase();
const BUSINESS_MODELS = [
  SinhVien,
  NhomHocPhan,
  DiemDanh,
  HoSoChamSoc,
  CuocGoi,
  NhiemVu,
  LichSuPhanCong,
];
// Models whose unique indexes changed from global to per unit.
const REINDEXED_MODELS = [SinhVien, NhomHocPhan, LichSuPhanCong];

async function assignUnits() {
  // 1. Every manager owns a unit.
  const managers = await NguoiDung.find({ role: 'manager', unitId: null }).select('_id');
  for (const m of managers) await NguoiDung.updateOne({ _id: m._id }, { unitId: m._id });

  // 2. The default unit.
  const settings = (await CaiDatHeThong.findOne()) || (await CaiDatHeThong.create({}));
  if (!settings.defaultUnitId) {
    const owner =
      (await NguoiDung.findOne({ email: LEGACY_UNIT_EMAIL(), role: 'manager' })) ||
      (await NguoiDung.findOne({ role: 'manager' }).sort({ createdAt: 1 }));
    if (!owner) return { defaultUnitId: null }; // no manager yet: try again next startup
    settings.defaultUnitId = owner.unitId || owner._id;
    await settings.save();
    // The care settings from before units existed become the default unit's.
    if (!(await CauHinhDonVi.exists({ unitId: settings.defaultUnitId }))) {
      await CauHinhDonVi.create({
        unitId: settings.defaultUnitId,
        warningLevels: settings.warningLevels?.length ? settings.warningLevels : undefined,
        absenceReasons: settings.absenceReasons,
        tags: settings.tags,
      });
    }
    // Per-unit codes: drop the old global unique indexes, build the new ones.
    for (const model of REINDEXED_MODELS) await model.syncIndexes();
    console.log(`[Đơn vị] Dữ liệu hiện có thuộc đơn vị của ${owner.email}.`);
  }
  const unitId = settings.defaultUnitId;

  // 3. Staff / teachers and records without a unit join the default unit.
  await NguoiDung.updateMany({ role: { $in: ['staff', 'teacher'] }, unitId: null }, { unitId });
  for (const model of BUSINESS_MODELS) await model.updateMany({ unitId: null }, { unitId });
  return { defaultUnitId: unitId };
}

module.exports = { assignUnits };
