// Đưa mọi tài khoản và bản ghi vào một đơn vị. An toàn khi chạy ở mỗi lần khởi động.
// - Mỗi Trưởng phòng / PHT sở hữu đơn vị riêng của họ (unitId = _id của họ).
// - Đơn vị mặc định thuộc về LEGACY_UNIT_EMAIL (hoặc trưởng phòng lâu đời nhất): giữ dữ liệu
//   từ trước khi có đơn vị, nhân viên và giảng viên chưa có đơn vị, và cấu hình chăm sóc cũ.
// - Mọi thứ còn chưa có đơn vị (vd dữ liệu demo gieo lúc khởi động) vào đơn vị mặc định.
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
// Các model có unique index đổi từ toàn cục sang theo từng đơn vị.
const REINDEXED_MODELS = [SinhVien, NhomHocPhan, LichSuPhanCong];

async function assignUnits() {
  // 1. Mỗi trưởng phòng sở hữu một đơn vị.
  const managers = await NguoiDung.find({ role: 'manager', unitId: null }).select('_id');
  for (const m of managers) await NguoiDung.updateOne({ _id: m._id }, { unitId: m._id });

  // 2. Đơn vị mặc định.
  const settings = (await CaiDatHeThong.findOne()) || (await CaiDatHeThong.create({}));
  if (!settings.defaultUnitId) {
    const owner =
      (await NguoiDung.findOne({ email: LEGACY_UNIT_EMAIL(), role: 'manager' })) ||
      (await NguoiDung.findOne({ role: 'manager' }).sort({ createdAt: 1 }));
    if (!owner) return { defaultUnitId: null }; // chưa có trưởng phòng: thử lại ở lần khởi động sau
    settings.defaultUnitId = owner.unitId || owner._id;
    await settings.save();
    // Cấu hình chăm sóc từ trước khi có đơn vị trở thành của đơn vị mặc định.
    if (!(await CauHinhDonVi.exists({ unitId: settings.defaultUnitId }))) {
      await CauHinhDonVi.create({
        unitId: settings.defaultUnitId,
        warningLevels: settings.warningLevels?.length ? settings.warningLevels : undefined,
        absenceReasons: settings.absenceReasons,
        tags: settings.tags,
      });
    }
    // Mã theo từng đơn vị: bỏ các unique index toàn cục cũ, dựng index mới.
    for (const model of REINDEXED_MODELS) await model.syncIndexes();
    console.log(`[Đơn vị] Dữ liệu hiện có thuộc đơn vị của ${owner.email}.`);
  }
  const unitId = settings.defaultUnitId;

  // 3. Nhân viên / giảng viên và bản ghi chưa có đơn vị vào đơn vị mặc định.
  await NguoiDung.updateMany({ role: { $in: ['staff', 'teacher'] }, unitId: null }, { unitId });
  for (const model of BUSINESS_MODELS) await model.updateMany({ unitId: null }, { unitId });
  return { defaultUnitId: unitId };
}

module.exports = { assignUnits };
