const { assert } = require('../utils/kiemTra');
const express = require('express');
const router = express.Router();
const CaiDatHeThong = require('../models/CaiDatHeThong');
const {
  verifyToken,
  requireAdmin,
  requireSignedIn,
  requirePermission,
} = require('../middleware/xacThuc');
const { getWarningLevels, clearWarningCache } = require('../services/dichVuCanhBao');
const { describeIntegrations, updateIntegrations } = require('../services/dichVuCauHinhApi');
const { WARNING_UNITS } = require('../utils/hangSo');

const BRANDING_FIELDS =
  'systemTitle schoolName departmentName supportHotline supportEmail logoDataUrl primaryColor';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO_CHARS = 400 * 1024; // ~300 KB image as a data URL

async function loadSettings() {
  return (await CaiDatHeThong.findOne()) || CaiDatHeThong.create({});
}

/** Settings as returned to the app: never the encrypted API keys; warning levels resolved. */
async function publicSettings(settings) {
  const { integrations, ...rest } = settings.toObject();
  return { ...rest, warningLevels: await getWarningLevels() };
}

const stringList = (value, name) => {
  assert(
    Array.isArray(value) &&
      value.length <= 50 &&
      value.every((v) => typeof v === 'string' && v.trim() && v.length <= 60),
    `Danh sách ${name} không hợp lệ`,
  );
  return [...new Set(value.map((v) => v.trim()))];
};

// GET /api/settings/branding (public) — name, logo and colour for the login page and app shell.
router.get('/branding', async (req, res, next) => {
  try {
    const settings = await CaiDatHeThong.findOne().select(BRANDING_FIELDS).lean();
    res.json(settings || {});
  } catch (error) {
    next(error);
  }
});

// GET /api/settings (every signed-in user)
router.get('/', verifyToken, requireSignedIn, async (req, res, next) => {
  try {
    res.json(await publicSettings(await loadSettings()));
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings (Admin) — system identity and web interface.
router.put('/', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const settings = await loadSettings();
    for (const field of [
      'systemTitle',
      'schoolName',
      'departmentName',
      'supportHotline',
      'supportEmail',
    ]) {
      const value = req.body?.[field];
      if (value === undefined) continue;
      assert(typeof value === 'string' && value.length <= 200, `Giá trị ${field} không hợp lệ`);
      settings[field] = value.trim();
    }
    const { logoDataUrl, primaryColor } = req.body ?? {};
    if (logoDataUrl !== undefined) {
      assert(
        logoDataUrl === '' ||
          (typeof logoDataUrl === 'string' &&
            /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(logoDataUrl) &&
            logoDataUrl.length <= MAX_LOGO_CHARS),
        'Logo phải là ảnh PNG/JPG/WebP/SVG, tối đa khoảng 300 KB',
      );
      settings.logoDataUrl = logoDataUrl;
    }
    if (primaryColor !== undefined) {
      assert(
        typeof primaryColor === 'string' && HEX_COLOR.test(primaryColor),
        'Màu chủ đạo không hợp lệ',
      );
      settings.primaryColor = primaryColor;
    }
    await settings.save();
    res.json({ message: 'Đã lưu cấu hình hệ thống!', settings: await publicSettings(settings) });
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings/care (Trưởng phòng / PHT: warnings.configure) — warning levels and care lists.
router.put(
  '/care',
  verifyToken,
  requirePermission('warnings.configure'),
  async (req, res, next) => {
    try {
      const settings = await loadSettings();
      const { warningLevels, absenceReasons, tags } = req.body ?? {};
      if (warningLevels !== undefined) {
        assert(
          Array.isArray(warningLevels) && warningLevels.length >= 1 && warningLevels.length <= 10,
          'Cần từ 1 đến 10 mức cảnh báo',
        );
        const names = new Set();
        settings.warningLevels = warningLevels.map((level, i) => {
          const name = typeof level?.name === 'string' ? level.name.trim() : '';
          const threshold = Number(level?.threshold);
          assert(name && name.length <= 50, `Mức ${i + 1}: tên không hợp lệ`);
          assert(!names.has(name.toLowerCase()), `Tên mức "${name}" bị trùng`);
          names.add(name.toLowerCase());
          assert(WARNING_UNITS.includes(level.unit), `Mức "${name}": đơn vị không hợp lệ`);
          assert(
            Number.isFinite(threshold) &&
              threshold > 0 &&
              threshold <= (level.unit === 'percent' ? 100 : 1000),
            `Mức "${name}": ngưỡng không hợp lệ`,
          );
          assert(HEX_COLOR.test(level.color || ''), `Mức "${name}": màu không hợp lệ`);
          return {
            name,
            unit: level.unit,
            threshold,
            color: level.color,
            examBan: Boolean(level.examBan),
          };
        });
      }
      if (absenceReasons !== undefined)
        settings.absenceReasons = stringList(absenceReasons, 'lý do vắng');
      if (tags !== undefined) settings.tags = stringList(tags, 'nhãn');
      await settings.save();
      clearWarningCache();
      res.json({
        message: 'Đã lưu cấu hình cảnh báo & chăm sóc!',
        settings: await publicSettings(settings),
      });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/settings/integrations (Admin) — API keys, secrets masked.
router.get('/integrations', verifyToken, requireAdmin, (req, res) => {
  res.json(describeIntegrations());
});

// PUT /api/settings/integrations (Admin) — body { values: { KEY: 'value' | '' } }.
router.put('/integrations', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const items = await updateIntegrations(req.body?.values);
    res.json({ message: 'Đã lưu cấu hình API!', items });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
