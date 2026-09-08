const CALL_STATUS = Object.freeze({
  PENDING: 'Chưa gọi',
  UNREACHABLE: 'Không bắt máy',
  CONTACTED: 'Đã liên hệ',
});
const CALL_STATUSES = Object.freeze(Object.values(CALL_STATUS));
module.exports = { CALL_STATUS, CALL_STATUSES };
