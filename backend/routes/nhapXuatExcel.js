const express = require('express');
const { keepUnit } = require('../utils/donVi');
const router = express.Router();
const multer = require('multer');
const { verifyToken, requirePermission } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienNhapXuatExcel');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
const uploadFile = keepUnit(upload.single('file'));
const canImport = [verifyToken, requirePermission('excel.import')];

// GET /api/excel/course-template — Excel mẫu theo từng học phần (mỗi sheet = 1 groupCode)
router.get('/course-template', ...canImport, ctrl.exportCourseTemplate);

// POST /api/excel/import-by-course — Excel nhiều sheet, tạo/cập nhật SV và gán vào học phần
router.post('/import-by-course', ...canImport, uploadFile, ctrl.importByCourse);

// GET /api/excel/export-template (cũ — giữ backward compat)
router.get('/export-template', ...canImport, ctrl.exportTemplate);

// POST /api/excel/import-data (cũ — giữ backward compat)
router.post('/import-data', ...canImport, uploadFile, ctrl.importData);

module.exports = router;
