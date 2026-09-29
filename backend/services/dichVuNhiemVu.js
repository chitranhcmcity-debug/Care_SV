// Nghiệp vụ giao việc nội bộ (NhiemVu): dùng chung cho các route /api/tasks và cho AI Care,
// để một thao tác luôn theo đúng một bộ quy tắc dù được làm từ giao diện hay qua trợ lý AI.
const NhiemVu = require('../models/NhiemVu');
const NguoiDung = require('../models/NguoiDung');
const { TASK_STATUS, TASK_CATEGORIES, TASK_PRIORITIES } = require('../utils/hangSo');
const { assert, validateId, parseOptionalDate } = require('../utils/kiemTra');

// Keep the log bounded: a long-running task can be reported on many times.
const MAX_PROGRESS_LOG = 50;
function logProgress(task, percent, note = '') {
  task.progress = percent;
  task.progressLog.push({ percent, note, at: new Date() });
  if (task.progressLog.length > MAX_PROGRESS_LOG)
    task.progressLog.splice(0, task.progressLog.length - MAX_PROGRESS_LOG);
}

// Optional category / priority from a create or edit body; undefined = leave unchanged.
function readClassification(body, task) {
  const { category, priority } = body;
  if (category !== undefined) {
    assert(TASK_CATEGORIES.includes(category), 'Loại công việc không hợp lệ');
    task.category = category;
  }
  if (priority !== undefined) {
    assert(TASK_PRIORITIES.includes(priority), 'Mức độ ưu tiên không hợp lệ');
    task.priority = priority;
  }
}

/** Active CSKH staff member a task can be given to. */
async function findAssignableStaff(staffId) {
  validateId(staffId);
  const staff = await NguoiDung.findById(staffId);
  assert(
    staff && staff.status === 'active' && staff.role === 'staff',
    'Vui lòng chọn một nhân viên CSKH đang hoạt động',
  );
  return staff;
}

/** Creates and assigns a task; returns { task, staff }. */
async function createTask(body, assignedBy) {
  const { title, description, assignedTo, dueDate } = body;
  assert(typeof title === 'string' && title.trim(), 'Tiêu đề là bắt buộc');
  assert(typeof description === 'string' && description.trim(), 'Mô tả nhiệm vụ là bắt buộc');
  const staff = await findAssignableStaff(assignedTo);
  const task = new NhiemVu({
    title: title.trim(),
    description: description.trim(),
    assignedBy,
    assignedTo: staff._id,
    dueDate: parseOptionalDate(dueDate, 'Hạn chót không hợp lệ'),
  });
  readClassification(body, task);
  await task.save();
  return { task, staff };
}

function acknowledgeTask(task) {
  assert(task.status === TASK_STATUS.PENDING, 'Nhiệm vụ đã được xác nhận trước đó');
  task.status = TASK_STATUS.ACKNOWLEDGED;
  task.acknowledgedAt = new Date();
  return task.save();
}

/** Approves (optionally scored 1–5) or rejects a submitted task. */
function reviewTask(task, { approve, reviewNote, score }, reviewerId) {
  assert(task.status === TASK_STATUS.SUBMITTED, 'Nhiệm vụ chưa được nộp minh chứng để duyệt');
  assert(typeof approve === 'boolean', 'Vui lòng chọn Duyệt hoặc Từ chối');
  assert(reviewNote === undefined || typeof reviewNote === 'string', 'Ghi chú không hợp lệ');
  assert(
    score === undefined || score === null || (Number.isInteger(score) && score >= 1 && score <= 5),
    'Điểm chất lượng phải từ 1 đến 5',
  );
  task.status = approve ? TASK_STATUS.COMPLETED : TASK_STATUS.REJECTED;
  task.reviewScore = approve ? (score ?? null) : null;
  if (!approve) {
    task.reworkCount += 1;
    // Back to work: the progress bar drops so it no longer reads "100% done".
    logProgress(task, Math.min(task.progress, 90), 'Bị yêu cầu làm lại');
  }
  task.reviewNote = reviewNote ? reviewNote.trim() : '';
  task.reviewedBy = reviewerId;
  task.completedAt = approve ? new Date() : null;
  return task.save();
}

module.exports = {
  logProgress,
  readClassification,
  createTask,
  acknowledgeTask,
  reviewTask,
};
