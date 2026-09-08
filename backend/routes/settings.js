const { assert } = require('../utils/validation');
const express = require('express');
const router = express.Router();
const SystemSettings = require('../models/SystemSettings');
const { verifyToken, requireAdmin, requireStaffOrAdmin } = require('../middleware/auth');

// GET /api/settings (Fetch public/staff settings)
router.get('/', verifyToken, requireStaffOrAdmin, async (req, res, next) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = await SystemSettings.create({});
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
      defaultMajorPrefixes,
      crawlerMajorPrefixes,
      defaultConcurrency,
      defaultYearFilter,
      absenceReasons,
      tags,
    } = req.body;

    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = new SystemSettings();
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
    if (Array.isArray(crawlerMajorPrefixes)) {
      settings.crawlerMajorPrefixes = crawlerMajorPrefixes;
      settings.defaultMajorPrefixes = crawlerMajorPrefixes;
    } else if (Array.isArray(defaultMajorPrefixes)) {
      settings.defaultMajorPrefixes = defaultMajorPrefixes;
      settings.crawlerMajorPrefixes = defaultMajorPrefixes;
    }
    if (defaultConcurrency !== undefined) {
      assert(
        Number.isInteger(Number(defaultConcurrency)) &&
          Number(defaultConcurrency) >= 1 &&
          Number(defaultConcurrency) <= 15,
        'Invalid defaultConcurrency',
      );
      settings.defaultConcurrency = Number(defaultConcurrency);
    }
    if (defaultYearFilter !== undefined) settings.defaultYearFilter = defaultYearFilter;
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
