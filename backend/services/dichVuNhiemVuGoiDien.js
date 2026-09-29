// Ghi nhận kết quả một nhiệm vụ gọi điện: dùng chung cho route /api/call-tasks/:id/update và
// cho AI Care, để số lần gọi, hẹn gọi lại và nhãn sinh viên luôn được tính theo một quy tắc.
const SinhVien = require('../models/SinhVien');
const { CALL_STATUS, CALL_STATUSES } = require('../utils/hangSo');
const { assert } = require('../utils/kiemTra');

/**
 * Applies { status, callNote, absenceReasonCategory, callbackDate, tags } (each optional) to a
 * call task the caller has already been checked against, and saves it.
 */
async function updateCallTask(task, { status, callNote, absenceReasonCategory, callbackDate, tags }) {
  assert(status === undefined || CALL_STATUSES.includes(status), 'Invalid call status');
  assert(callNote === undefined || typeof callNote === 'string', 'Invalid call note');
  assert(
    absenceReasonCategory === undefined || typeof absenceReasonCategory === 'string',
    'Invalid absence reason',
  );
  assert(
    callbackDate === undefined ||
      callbackDate === null ||
      callbackDate === '' ||
      (typeof callbackDate === 'string' && !Number.isNaN(Date.parse(callbackDate))),
    'Invalid callback date',
  );
  assert(
    tags === undefined || (Array.isArray(tags) && tags.every((t) => typeof t === 'string')),
    'Invalid tags',
  );

  const previousStatus = task.status;
  if (status) task.status = status;
  if (callNote !== undefined) task.callNote = callNote;
  if (absenceReasonCategory !== undefined) task.absenceReasonCategory = absenceReasonCategory;
  if (callbackDate !== undefined) task.callbackDate = callbackDate ? new Date(callbackDate) : null;

  // Count a call attempt only when an outcome is recorded: the status changes,
  // or a retry is logged as unreachable. Editing notes/tags alone is not a call.
  if (status && (status !== previousStatus || status === CALL_STATUS.UNREACHABLE))
    task.callAttempts = (task.callAttempts || 0) + 1;

  await task.save();
  // Tags belong to the student, not the task.
  if (Array.isArray(tags) && task.studentId)
    await SinhVien.findByIdAndUpdate(task.studentId, { tags });
  return task;
}

module.exports = { updateCallTask };
