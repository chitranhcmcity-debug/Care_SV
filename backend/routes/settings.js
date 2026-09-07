const express = require('express');
const router = express.Router();
const SystemSettings = require('../models/SystemSettings');
const { verifyToken, requireAdmin, requireStaffOrAdmin } = require('../middleware/auth');

// GET /api/settings (Fetch public/staff settings)
router.get('/', verifyToken, requireStaffOrAdmin, async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = await SystemSettings.create({});
    }
    res.json(settings);
  } catch (error) {
    console.error('Fetch settings error:', error);
    res.status(500).json({ message: 'Không thể lấy cấu hình hệ thống' });
  }
});

// PUT /api/settings (Update full system configuration - Admin only)
router.put('/', verifyToken, requireAdmin, async (req, res) => {
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
    if (examBanThreshold !== undefined) settings.examBanThreshold = Number(examBanThreshold) || 3;
    if (parentWarningThreshold !== undefined) settings.parentWarningThreshold = Number(parentWarningThreshold) || 2;
    if (taskAssignmentRule !== undefined) settings.taskAssignmentRule = taskAssignmentRule;
    if (Array.isArray(crawlerMajorPrefixes)) {
      settings.crawlerMajorPrefixes = crawlerMajorPrefixes;
      settings.defaultMajorPrefixes = crawlerMajorPrefixes;
    } else if (Array.isArray(defaultMajorPrefixes)) {
      settings.defaultMajorPrefixes = defaultMajorPrefixes;
      settings.crawlerMajorPrefixes = defaultMajorPrefixes;
    }
    if (defaultConcurrency !== undefined) settings.defaultConcurrency = Number(defaultConcurrency) || 6;
    if (defaultYearFilter !== undefined) settings.defaultYearFilter = defaultYearFilter;
    if (Array.isArray(absenceReasons)) settings.absenceReasons = absenceReasons;
    if (Array.isArray(tags)) settings.tags = tags;

    await settings.save();

    res.json({
      message: 'Cập nhật toàn bộ cấu hình hệ thống thành công!',
      settings,
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật cấu hình hệ thống' });
  }
});

module.exports = router;
