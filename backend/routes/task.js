const express = require('express');
const router = express.Router();
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const multer = require('multer');
const Task = require('../models/Task');
const User = require('../models/User');
const { TASK_STATUS, TASK_STATUSES } = require('../constants/taskStatus');
const { verifyToken, requireAdmin, requireStaffOrAdmin } = require('../middleware/auth');
const { assert, validateId } = require('../utils/validation');

// ---- Evidence file upload (disk storage; served back through an authenticated route,
// never express.static, so evidence isn't reachable by anyone who guesses the URL) ----
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'tasks');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
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
      return cb(new Error('Định dạng file không được hỗ trợ'));
    }
    cb(null, true);
  },
});
function handleUpload(req, res, next) {
  upload.array('files', 5)(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Lỗi tải file minh chứng' });
    next();
  });
}
function removeFiles(files) {
  for (const file of files) fs.unlink(path.join(UPLOAD_DIR, file.storedName), () => {});
}

async function loadTaskForUser(req, res, next) {
  try {
    validateId(req.params.id);
    const task = await Task.findById(req.params.id);
    assert(task, 'Không tìm thấy nhiệm vụ', 404);
    assert(
      req.user.role === 'admin' || String(task.assignedTo) === req.user.id,
      'Bạn không có quyền truy cập nhiệm vụ này',
      403,
    );
    req.task = task;
    next();
  } catch (error) {
    next(error);
  }
}

const taskPopulation = [
  { path: 'assignedTo', select: 'fullName email' },
  { path: 'assignedBy', select: 'fullName email' },
  { path: 'reviewedBy', select: 'fullName email' },
];

// POST /api/tasks (Admin: create & assign a task to a staff member)
router.post('/', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { title, description, assignedTo, dueDate } = req.body;
    assert(typeof title === 'string' && title.trim(), 'Tiêu đề là bắt buộc');
    assert(typeof description === 'string' && description.trim(), 'Mô tả nhiệm vụ là bắt buộc');
    validateId(assignedTo);
    const staff = await User.findById(assignedTo);
    assert(
      staff && staff.status === 'active' && staff.role === 'staff',
      'Vui lòng chọn một nhân viên CSKH đang hoạt động',
    );
    let parsedDueDate = null;
    if (dueDate) {
      parsedDueDate = new Date(dueDate);
      assert(!Number.isNaN(parsedDueDate.getTime()), 'Hạn chót không hợp lệ');
    }
    const task = await Task.create({
      title: title.trim(),
      description: description.trim(),
      assignedBy: req.user.id,
      assignedTo,
      dueDate: parsedDueDate,
    });
    await task.populate(taskPopulation);
    res.status(201).json({ message: `Đã giao nhiệm vụ cho ${staff.fullName}!`, task });
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/admin-all (Admin: list every task, optional status/assignedTo filters)
router.get('/admin-all', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { status, assignedTo } = req.query;
    const filter = {};
    if (status) {
      assert(TASK_STATUSES.includes(status), 'Trạng thái không hợp lệ');
      filter.status = status;
    }
    if (assignedTo) {
      validateId(assignedTo);
      filter.assignedTo = assignedTo;
    }
    const tasks = await Task.find(filter).populate(taskPopulation).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/my-tasks (Staff: tasks assigned to me)
router.get('/my-tasks', verifyToken, requireStaffOrAdmin, async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = { assignedTo: req.user.id };
    if (status) {
      assert(TASK_STATUSES.includes(status), 'Trạng thái không hợp lệ');
      filter.status = status;
    }
    const tasks = await Task.find(filter).populate(taskPopulation).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/pending-count (Staff: badge count of tasks needing action)
router.get('/pending-count', verifyToken, requireStaffOrAdmin, async (req, res, next) => {
  try {
    const count = await Task.countDocuments({
      assignedTo: req.user.id,
      status: { $in: [TASK_STATUS.PENDING, TASK_STATUS.REJECTED] },
    });
    res.json({ pendingCount: count });
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/:id (Admin, or the assignee)
router.get('/:id', verifyToken, requireStaffOrAdmin, loadTaskForUser, async (req, res, next) => {
  try {
    await req.task.populate(taskPopulation);
    res.json(req.task);
  } catch (error) {
    next(error);
  }
});

// PUT /api/tasks/:id (Admin: edit title/description/due date before work is submitted)
router.put('/:id', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    validateId(req.params.id);
    const task = await Task.findById(req.params.id);
    assert(task, 'Không tìm thấy nhiệm vụ', 404);
    assert(
      [TASK_STATUS.PENDING, TASK_STATUS.ACKNOWLEDGED].includes(task.status),
      'Chỉ có thể sửa nhiệm vụ khi chưa nộp minh chứng',
    );
    const { title, description, dueDate } = req.body;
    if (title !== undefined) {
      assert(typeof title === 'string' && title.trim(), 'Tiêu đề không hợp lệ');
      task.title = title.trim();
    }
    if (description !== undefined) {
      assert(typeof description === 'string' && description.trim(), 'Mô tả không hợp lệ');
      task.description = description.trim();
    }
    if (dueDate !== undefined) {
      if (!dueDate) {
        task.dueDate = null;
      } else {
        const parsed = new Date(dueDate);
        assert(!Number.isNaN(parsed.getTime()), 'Hạn chót không hợp lệ');
        task.dueDate = parsed;
      }
    }
    await task.save();
    await task.populate(taskPopulation);
    res.json({ message: 'Đã cập nhật nhiệm vụ', task });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/tasks/:id (Admin: cancel a task and clean up its evidence files)
router.delete('/:id', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    validateId(req.params.id);
    const task = await Task.findByIdAndDelete(req.params.id);
    assert(task, 'Không tìm thấy nhiệm vụ', 404);
    removeFiles(task.evidenceFiles);
    res.json({ message: 'Đã xóa nhiệm vụ' });
  } catch (error) {
    next(error);
  }
});

// PUT /api/tasks/:id/acknowledge (Staff: confirm receipt of the task)
router.put(
  '/:id/acknowledge',
  verifyToken,
  requireStaffOrAdmin,
  loadTaskForUser,
  async (req, res, next) => {
    try {
      assert(req.user.role !== 'admin', 'Chỉ nhân viên được giao mới xác nhận nhiệm vụ', 403);
      assert(req.task.status === TASK_STATUS.PENDING, 'Nhiệm vụ đã được xác nhận trước đó');
      req.task.status = TASK_STATUS.ACKNOWLEDGED;
      req.task.acknowledgedAt = new Date();
      await req.task.save();
      await req.task.populate(taskPopulation);
      res.json({ message: 'Đã xác nhận nhiệm vụ, bắt đầu thực hiện!', task: req.task });
    } catch (error) {
      next(error);
    }
  },
);

// PUT /api/tasks/:id/submit (Staff: submit evidence — note, link and/or files, any mix)
router.put(
  '/:id/submit',
  verifyToken,
  requireStaffOrAdmin,
  loadTaskForUser,
  handleUpload,
  async (req, res, next) => {
    try {
      assert(req.user.role !== 'admin', 'Chỉ nhân viên được giao mới nộp minh chứng', 403);
      assert(
        [TASK_STATUS.ACKNOWLEDGED, TASK_STATUS.REJECTED].includes(req.task.status),
        'Cần xác nhận nhiệm vụ trước khi nộp minh chứng',
      );
      const { note, link } = req.body;
      const files = req.files || [];
      assert(
        (note && note.trim()) || (link && link.trim()) || files.length > 0,
        'Vui lòng cung cấp ít nhất một minh chứng: ghi chú, link hoặc file',
      );
      if (link && link.trim()) {
        assert(
          /^https?:\/\//i.test(link.trim()),
          'Link minh chứng phải bắt đầu bằng http:// hoặc https://',
        );
      }
      // A resubmission after rejection replaces the previous evidence set.
      removeFiles(req.task.evidenceFiles);
      req.task.evidenceNote = note ? note.trim() : '';
      req.task.evidenceLink = link ? link.trim() : '';
      req.task.evidenceFiles = files.map((f) => ({
        storedName: f.filename,
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
      }));
      req.task.status = TASK_STATUS.SUBMITTED;
      req.task.submittedAt = new Date();
      req.task.reviewNote = '';
      await req.task.save();
      await req.task.populate(taskPopulation);
      res.json({ message: 'Đã nộp minh chứng, chờ sếp duyệt!', task: req.task });
    } catch (error) {
      next(error);
    }
  },
);

// PUT /api/tasks/:id/review (Admin: approve & close, or reject back to the assignee)
router.put('/:id/review', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    validateId(req.params.id);
    const task = await Task.findById(req.params.id);
    assert(task, 'Không tìm thấy nhiệm vụ', 404);
    assert(task.status === TASK_STATUS.SUBMITTED, 'Nhiệm vụ chưa được nộp minh chứng để duyệt');
    const { approve, reviewNote } = req.body;
    assert(typeof approve === 'boolean', 'Vui lòng chọn Duyệt hoặc Từ chối');
    assert(reviewNote === undefined || typeof reviewNote === 'string', 'Ghi chú không hợp lệ');
    task.status = approve ? TASK_STATUS.COMPLETED : TASK_STATUS.REJECTED;
    task.reviewNote = reviewNote ? reviewNote.trim() : '';
    task.reviewedBy = req.user.id;
    task.completedAt = approve ? new Date() : null;
    await task.save();
    await task.populate(taskPopulation);
    res.json({
      message: approve ? 'Đã duyệt và đóng nhiệm vụ!' : 'Đã từ chối, yêu cầu nhân viên làm lại.',
      task,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/:id/evidence/:fileId (stream one evidence file — admin or the assignee only)
router.get(
  '/:id/evidence/:fileId',
  verifyToken,
  requireStaffOrAdmin,
  loadTaskForUser,
  async (req, res, next) => {
    try {
      const file = req.task.evidenceFiles.id(req.params.fileId);
      assert(file, 'Không tìm thấy tệp minh chứng', 404);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(file.originalName)}"`,
      );
      res.sendFile(path.join(UPLOAD_DIR, file.storedName), (err) => {
        if (err) next(err);
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
