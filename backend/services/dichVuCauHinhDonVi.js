// Cấu hình chăm sóc của đơn vị hiện tại (mức cảnh báo, lý do vắng, nhãn sinh viên).
// Ngoài một đơn vị (admin, công việc hệ thống) thì áp dụng cấu hình của đơn vị mặc định.
const CaiDatHeThong = require('../models/CaiDatHeThong');
const CauHinhDonVi = require('../models/CauHinhDonVi');
const { currentUnit } = require('../utils/donVi');

/** Đơn vị có cấu hình áp dụng cho request hiện tại (null khi cài đặt chưa có đơn vị). */
async function settingsUnit() {
  const unitId = currentUnit();
  if (unitId) return unitId;
  const settings = await CaiDatHeThong.findOne().select('defaultUnitId').lean();
  return settings?.defaultUnitId ? String(settings.defaultUnitId) : null;
}

/** Tài liệu cấu hình của đơn vị, tạo với giá trị mặc định ở lần dùng đầu tiên. */
async function loadUnitConfig() {
  const unitId = await settingsUnit();
  return (
    (await CauHinhDonVi.findOne({ unitId })) ||
    // Upsert: hai request đầu tiên cùng lúc không được cùng tạo một bản.
    CauHinhDonVi.findOneAndUpdate(
      { unitId },
      { $setOnInsert: { unitId } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    )
  );
}

module.exports = { settingsUnit, loadUnitConfig };
