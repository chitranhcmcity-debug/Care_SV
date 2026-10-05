const express = require('express');
const { keepUnit } = require('../utils/donVi');
const router = express.Router();
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const ctrl = require('../controllers/dieuKhienNhiemVu');
const {
  verifyToken,
  requirePermission,
  requireSignedIn,
  requireRoles,
} = require('../middleware/xacThuc');

// Chỉ nhân viên được giao mới xử lý nhiệm vụ (xác nhận / nộp) — admin thì không.
const requireStaff = requireRoles('staff');

// ---- Upload file minh chứng (lưu trên đĩa; trả lại qua route có xác thực,
// không dùng express.static, để minh chứng không bị truy cập chỉ vì đoán được URL) ----
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ctrl.UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(path.basename(file.originalname)).slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(Object.assign(new Error('Định dạng file không được hỗ trợ'), { status: 400 }));
    }
    cb(null, true);
  },
});
const uploadEvidence = keepUnit(upload.array('files', 5));

const manage = [verifyToken, requirePermission('tasks.manage')];
const ownTask = [verifyToken, requireSignedIn, ctrl.loadTask, ctrl.requireTaskOwnerOrAdmin];
const staffTask = [verifyToken, requireStaff, ctrl.loadTask, ctrl.requireTaskOwnerOrAdmin];

router.post('/', ...manage, ctrl.create);
router.get('/admin-all', ...manage, ctrl.listAll);
router.get('/my-tasks', verifyToken, requireSignedIn, ctrl.listMine);
router.get('/pending-count', verifyToken, requireSignedIn, ctrl.pendingCount);
router.get('/staff-progress', ...manage, ctrl.getStaffProgress);

router.get('/:id', ...ownTask, ctrl.getOne);
router.put('/:id', ...manage, ctrl.loadTask, ctrl.update);
router.delete('/:id', ...manage, ctrl.loadTask, ctrl.remove);
router.put('/:id/acknowledge', ...staffTask, ctrl.acknowledge);
router.put('/:id/progress', ...staffTask, ctrl.reportProgress);
router.put('/:id/submit', ...staffTask, uploadEvidence, ctrl.submit);
router.put('/:id/review', ...manage, ctrl.loadTask, ctrl.review);
router.get('/:id/evidence/:fileId', ...ownTask, ctrl.downloadEvidence);

module.exports = router;
