const TASK_STATUS = Object.freeze({
  PENDING: 'Mới giao',
  ACKNOWLEDGED: 'Đã xác nhận',
  SUBMITTED: 'Chờ duyệt',
  COMPLETED: 'Hoàn thành',
  REJECTED: 'Bị từ chối',
});
const TASK_STATUSES = Object.freeze(Object.values(TASK_STATUS));
module.exports = { TASK_STATUS, TASK_STATUSES };
