const CALL_STATUS = Object.freeze({
  PENDING: 'Chưa gọi',
  UNREACHABLE: 'Không bắt máy',
  CONTACTED: 'Đã liên hệ',
});
const CALL_STATUSES = Object.freeze(Object.values(CALL_STATUS));
// Tasks that still need a call — what counts toward a staff member's workload.
const OPEN_CALL_STATUSES = Object.freeze([CALL_STATUS.PENDING, CALL_STATUS.UNREACHABLE]);
module.exports = { CALL_STATUS, CALL_STATUSES, OPEN_CALL_STATUSES };
