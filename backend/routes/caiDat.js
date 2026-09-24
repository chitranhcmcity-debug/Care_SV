const { assert } = require('../utils/kiemTra');
const express = require('express');
const router = express.Router();
const CaiDatHeThong = require('../models/CaiDatHeThong');
const { verifyToken, requireAdmin, requireSignedIn } = require('../middleware/xacThuc');

// GET /api/settings (Fetch public/staff settings)
router.get('/', verifyToken, requireSignedIn, async (req, res, next) => {
  try {
    let settings = await CaiDatHeThong.findOne();
    if (!settings) {
      settings = await CaiDatHeThong.create({});
    }
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings (Update full system configuration - Admin only)
router.put('/', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const {
      systemTitle,
      schoolName,
      departmentName,
      supportHotline,
      supportEmail,
      examBanThreshold,
      parentWarningThreshold,
      taskAssignmentRule,
      absenceReasons,
      tags,
    } = req.body;

    let settings = await CaiDatHeThong.findOne();
    if (!settings) {
      settings = new CaiDatHeThong();
    }

    if (systemTitle !== undefined) settings.systemTitle = systemTitle;
    if (schoolName !== undefined) settings.schoolName = schoolName;
    if (departmentName !== undefined) settings.departmentName = departmentName;
    if (supportHotline !== undefined) settings.supportHotline = supportHotline;
    if (supportEmail !== undefined) settings.supportEmail = supportEmail;
    if (examBanThreshold !== undefined) {
      assert(
        Number.isInteger(Number(examBanThreshold)) &&
          Number(examBanThreshold) >= 1 &&
          Number(examBanThreshold) <= 1000,
        'Invalid examBanThreshold',
      );
      settings.examBanThreshold = Number(examBanThreshold);
    }
    if (parentWarningThreshold !== undefined) {
      assert(
        Number.isInteger(Number(parentWarningThreshold)) &&
          Number(parentWarningThreshold) >= 1 &&
          Number(parentWarningThreshold) <= 1000,
        'Invalid parentWarningThreshold',
      );
      settings.parentWarningThreshold = Number(parentWarningThreshold);
    }
    if (taskAssignmentRule !== undefined) settings.taskAssignmentRule = taskAssignmentRule;
    if (Array.isArray(absenceReasons)) settings.absenceReasons = absenceReasons;
    if (Array.isArray(tags)) settings.tags = tags;

    await settings.save();

    res.json({
      message: 'Cập nhật toàn bộ cấu hình hệ thống thành công!',
      settings,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
