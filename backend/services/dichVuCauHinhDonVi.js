// Care settings of the current unit (warning levels, absence reasons, student tags).
// Outside a unit (admin, system work) the default unit's settings apply.
const CaiDatHeThong = require('../models/CaiDatHeThong');
const CauHinhDonVi = require('../models/CauHinhDonVi');
const { currentUnit } = require('../utils/donVi');

/** Unit whose settings apply to the current request (null on an install without units). */
async function settingsUnit() {
  const unitId = currentUnit();
  if (unitId) return unitId;
  const settings = await CaiDatHeThong.findOne().select('defaultUnitId').lean();
  return settings?.defaultUnitId ? String(settings.defaultUnitId) : null;
}

/** The unit's settings document, created with the defaults on first use. */
async function loadUnitConfig() {
  const unitId = await settingsUnit();
  return (
    (await CauHinhDonVi.findOne({ unitId })) ||
    // Upsert: two first requests at once must not both create one.
    CauHinhDonVi.findOneAndUpdate(
      { unitId },
      { $setOnInsert: { unitId } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    )
  );
}

module.exports = { settingsUnit, loadUnitConfig };
