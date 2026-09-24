// Stored values are unaccented codes; the *_LABEL maps hold the Vietnamese display text.

// --- Trạng thái cuộc gọi
const CALL_STATUS = Object.freeze({
  PENDING: 'chua_goi',
  UNREACHABLE: 'khong_bat_may',
  CONTACTED: 'da_lien_he',
});
const CALL_STATUS_LABEL = Object.freeze({
  [CALL_STATUS.PENDING]: 'Chưa gọi',
  [CALL_STATUS.UNREACHABLE]: 'Không bắt máy',
  [CALL_STATUS.CONTACTED]: 'Đã liên hệ',
});
const CALL_STATUSES = Object.freeze(Object.values(CALL_STATUS));
// Tasks that still need a call — what counts toward a staff member's workload.
const OPEN_CALL_STATUSES = Object.freeze([CALL_STATUS.PENDING, CALL_STATUS.UNREACHABLE]);

// --- Trạng thái nhiệm vụ
const TASK_STATUS = Object.freeze({
  PENDING: 'moi_giao',
  ACKNOWLEDGED: 'da_xac_nhan',
  SUBMITTED: 'cho_duyet',
  COMPLETED: 'hoan_thanh',
  REJECTED: 'bi_tu_choi',
});
const TASK_STATUS_LABEL = Object.freeze({
  [TASK_STATUS.PENDING]: 'Mới giao',
  [TASK_STATUS.ACKNOWLEDGED]: 'Đã xác nhận',
  [TASK_STATUS.SUBMITTED]: 'Chờ duyệt',
  [TASK_STATUS.COMPLETED]: 'Hoàn thành',
  [TASK_STATUS.REJECTED]: 'Bị từ chối',
});
const TASK_STATUSES = Object.freeze(Object.values(TASK_STATUS));

// --- Lịch học
const SHIFT = Object.freeze({ MORNING: 'sang', AFTERNOON: 'chieu', EVENING: 'toi' });
const SHIFT_LABEL = Object.freeze({
  [SHIFT.MORNING]: 'Sáng',
  [SHIFT.AFTERNOON]: 'Chiều',
  [SHIFT.EVENING]: 'Tối',
});
const SHIFTS = Object.freeze(Object.values(SHIFT));

// Weekday code → JS Date#getDay() (0 = Sunday).
const WEEKDAY_INDEX = Object.freeze({
  chu_nhat: 0,
  thu_2: 1,
  thu_3: 2,
  thu_4: 3,
  thu_5: 4,
  thu_6: 5,
  thu_7: 6,
});
const WEEKDAY_LABEL = Object.freeze({
  thu_2: 'Thứ 2',
  thu_3: 'Thứ 3',
  thu_4: 'Thứ 4',
  thu_5: 'Thứ 5',
  thu_6: 'Thứ 6',
  thu_7: 'Thứ 7',
  chu_nhat: 'Chủ Nhật',
});
const WEEKDAYS = Object.freeze(Object.keys(WEEKDAY_LABEL));
const DEFAULT_SCHEDULE_DAYS = Object.freeze(['thu_2', 'thu_4', 'thu_6']);

// --- Vai trò
const ROLE_LABEL = Object.freeze({
  admin: 'Quản trị viên',
  manager: 'Trưởng phòng / Phó hiệu trưởng',
  staff: 'Nhân viên CSKH',
  teacher: 'Giảng viên',
});
const MANAGEMENT_ROLES = Object.freeze(['admin', 'manager']);
const isManagement = (user) => MANAGEMENT_ROLES.includes(user?.role);

// --- Gói sử dụng hệ thống (thanh toán qua PayOS)
// Giá tính bằng VND. Đây là giá của nhà cung cấp phần mềm, nên chỉ sửa ở đây, không cho admin tự đặt.
const SUBSCRIPTION_PLANS = Object.freeze([
  Object.freeze({ code: 'goi_1_thang', name: 'Gói 1 tháng', months: 1, amount: 499000 }),
  Object.freeze({ code: 'goi_6_thang', name: 'Gói 6 tháng', months: 6, amount: 2690000 }),
  Object.freeze({ code: 'goi_12_thang', name: 'Gói 12 tháng', months: 12, amount: 4790000 }),
]);
const ORDER_STATUS = Object.freeze({
  PENDING: 'cho_thanh_toan',
  PAID: 'da_thanh_toan',
  CANCELLED: 'da_huy',
  EXPIRED: 'het_han',
});
const ORDER_STATUS_LABEL = Object.freeze({
  [ORDER_STATUS.PENDING]: 'Chờ thanh toán',
  [ORDER_STATUS.PAID]: 'Đã thanh toán',
  [ORDER_STATUS.CANCELLED]: 'Đã hủy',
  [ORDER_STATUS.EXPIRED]: 'Hết hạn',
});
const ORDER_STATUSES = Object.freeze(Object.values(ORDER_STATUS));

// --- Nhãn hiển thị
// Every stored code is unique across these sets, so one lookup covers them all.
const LABELS = Object.freeze({
  ...CALL_STATUS_LABEL,
  ...TASK_STATUS_LABEL,
  ...SHIFT_LABEL,
  ...WEEKDAY_LABEL,
  ...ORDER_STATUS_LABEL,
});

// Vietnamese display text for a stored code; unknown values pass through unchanged.
const toLabel = (value) => LABELS[value] ?? value;

module.exports = {
  CALL_STATUS,
  CALL_STATUS_LABEL,
  CALL_STATUSES,
  OPEN_CALL_STATUSES,
  TASK_STATUS,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  SHIFT,
  SHIFT_LABEL,
  SHIFTS,
  WEEKDAY_INDEX,
  WEEKDAY_LABEL,
  WEEKDAYS,
  DEFAULT_SCHEDULE_DAYS,
  ROLE_LABEL,
  MANAGEMENT_ROLES,
  isManagement,
  SUBSCRIPTION_PLANS,
  ORDER_STATUS,
  ORDER_STATUS_LABEL,
  ORDER_STATUSES,
  LABELS,
  toLabel,
};
