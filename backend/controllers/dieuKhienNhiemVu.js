const path = require('node:path');
const fs = require('node:fs');
const NhiemVu = require('../models/NhiemVu');
const { TASK_STATUS, TASK_STATUSES } = require('../utils/hangSo');
const {
  logProgress,
  readClassification,
  createTask,
  acknowledgeTask,
  reviewTask,
} = require('../services/dichVuNhiemVu');
const { staffProgress } = require('../services/dichVuTienDoNhanVien');
const { can } = require('../services/dichVuPhanQuyen');
const { assert, validateId, parseOptionalDate } = require('../utils/kiemTra');
const { getUploadDir } = require('../utils/moiTruong');

const UPLOAD_DIR = path.join(getUploadDir(), 'tasks');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const taskPopulation = [
  { path: 'assignedTo', select: 'fullName email' },
  { path: 'assignedBy', select: 'fullName email' },
  { path: 'reviewedBy', select: 'fullName email' },
];

function removeFiles(files) {
  for (const file of files) fs.unlink(path.join(UPLOAD_DIR, file.storedName), () => {});
}

async function loadTask(req, res, next) {
  try {
    validateId(req.params.id);
    req.task = await NhiemVu.findById(req.params.id);
    assert(req.task, 'Không tìm thấy nhiệm vụ', 404);
    next();
  } catch (error) {
    next(error);
  }
}

function requireTaskOwnerOrAdmin(req, res, next) {
  const allowed = can(req.user, 'tasks.manage') || String(req.task.assignedTo) === req.user.id;
  if (!allowed)
    return res.status(403).json({ message: 'Bạn không có quyền truy cập nhiệm vụ này' });
  next();
}

async function create(req, res, next) {
  try {
    const { task, staff } = await createTask(req.body, req.user.id);
    await task.populate(taskPopulation);
    res.status(201).json({ message: `Đã giao nhiệm vụ cho ${staff.fullName}!`, task });
  } catch (error) {
    next(error);
  }
}

async function listAll(req, res, next) {
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
    const tasks = await NhiemVu.find(filter)
      .populate(taskPopulation)
      .sort({ createdAt: -1 })
      .lean();
    res.json(tasks);
  } catch (error) {
    next(error);
  }
}

async function listMine(req, res, next) {
  try {
    const { status } = req.query;
    const filter = { assignedTo: req.user.id };
    if (status) {
      assert(TASK_STATUSES.includes(status), 'Trạng thái không hợp lệ');
      filter.status = status;
    }
    const tasks = await NhiemVu.find(filter)
      .populate(taskPopulation)
      .sort({ createdAt: -1 })
      .lean();
    res.json(tasks);
  } catch (error) {
    next(error);
  }
}

async function pendingCount(req, res, next) {
  try {
    const count = await NhiemVu.countDocuments({
      assignedTo: req.user.id,
      status: { $in: [TASK_STATUS.PENDING, TASK_STATUS.REJECTED] },
    });
    res.json({ pendingCount: count });
  } catch (error) {
    next(error);
  }
}

async function getStaffProgress(req, res, next) {
  try {
    const from = parseOptionalDate(req.query.from, 'Ngày bắt đầu không hợp lệ');
    const to = parseOptionalDate(req.query.to, 'Ngày kết thúc không hợp lệ');
    assert(!from || !to || from <= to, 'Ngày bắt đầu phải trước ngày kết thúc');
    res.json({ from, to, staff: await staffProgress({ from, to }) });
  } catch (error) {
    next(error);
  }
}

async function getOne(req, res, next) {
  try {
    await req.task.populate(taskPopulation);
    res.json(req.task);
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const { task } = req;
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
    if (dueDate !== undefined) task.dueDate = parseOptionalDate(dueDate, 'Hạn chót không hợp lệ');
    readClassification(req.body, task);
    await task.save();
    await task.populate(taskPopulation);
    res.json({ message: 'Đã cập nhật nhiệm vụ', task });
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    await req.task.deleteOne();
    removeFiles(req.task.evidenceFiles);
    res.json({ message: 'Đã xóa nhiệm vụ' });
  } catch (error) {
    next(error);
  }
}

async function acknowledge(req, res, next) {
  try {
    await acknowledgeTask(req.task);
    await req.task.populate(taskPopulation);
    res.json({ message: 'Đã xác nhận nhiệm vụ, bắt đầu thực hiện!', task: req.task });
  } catch (error) {
    next(error);
  }
}

async function reportProgress(req, res, next) {
  try {
    assert(
      [TASK_STATUS.ACKNOWLEDGED, TASK_STATUS.REJECTED].includes(req.task.status),
      'Chỉ cập nhật tiến độ cho nhiệm vụ đang thực hiện',
    );
    const { percent, note } = req.body ?? {};
    assert(
      Number.isInteger(percent) && percent >= 0 && percent < 100,
      'Tiến độ phải là số nguyên từ 0 đến 99 (nộp minh chứng để hoàn thành 100%)',
    );
    assert(
      note === undefined || (typeof note === 'string' && note.length <= 500),
      'Ghi chú tiến độ tối đa 500 ký tự',
    );
    logProgress(req.task, percent, note ? note.trim() : '');
    await req.task.save();
    await req.task.populate(taskPopulation);
    res.json({ message: `Đã cập nhật tiến độ ${percent}%`, task: req.task });
  } catch (error) {
    next(error);
  }
}

async function submit(req, res, next) {
  const files = req.files || [];
  try {
    assert(
      [TASK_STATUS.ACKNOWLEDGED, TASK_STATUS.REJECTED].includes(req.task.status),
      'Cần xác nhận nhiệm vụ trước khi nộp minh chứng',
    );
    const { note, link } = req.body;
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
    // Nộp lại sau khi bị từ chối sẽ thay thế bộ minh chứng cũ (xóa sau khi lưu xong).
    const previousFiles = req.task.evidenceFiles.toObject();
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
    logProgress(req.task, 100, 'Nộp minh chứng hoàn thành');
    req.task.reviewNote = '';
    await req.task.save();
    removeFiles(previousFiles);
    await req.task.populate(taskPopulation);
    res.json({ message: 'Đã nộp minh chứng, chờ sếp duyệt!', task: req.task });
  } catch (error) {
    // File của lần nộp bị từ chối không được để lại trên đĩa.
    for (const file of files) fs.unlink(file.path, () => {});
    next(error);
  }
}

async function review(req, res, next) {
  try {
    const { task } = req;
    const approve = req.body?.approve;
    await reviewTask(task, req.body ?? {}, req.user.id);
    await task.populate(taskPopulation);
    res.json({
      message: approve ? 'Đã duyệt và đóng nhiệm vụ!' : 'Đã từ chối, yêu cầu nhân viên làm lại.',
      task,
    });
  } catch (error) {
    next(error);
  }
}

async function downloadEvidence(req, res, next) {
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
}

module.exports = {
  UPLOAD_DIR,
  loadTask,
  requireTaskOwnerOrAdmin,
  create,
  listAll,
  listMine,
  pendingCount,
  getStaffProgress,
  getOne,
  update,
  remove,
  acknowledge,
  reportProgress,
  submit,
  review,
  downloadEvidence,
};
