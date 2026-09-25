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

// --- Phân quyền theo vai trò
// Mô hình vai trò:
// - Admin: quản trị hệ thống (tài khoản, phân quyền, cấu hình hệ thống / API / giao diện, gói
//   dịch vụ). Được XEM dữ liệu nghiệp vụ (ADMIN_PERMISSIONS) nhưng không thao tác nghiệp vụ.
// - Trưởng phòng / Phó hiệu trưởng: giao việc, phân lớp cho CSKH, cấu hình mức cảnh báo, tổng quan.
// - Nhân viên CSKH: chăm sóc sinh viên thuộc các lớp hành chính được phân công.
// - Giảng viên: điểm danh học phần mình dạy, đúng giờ trong thời khóa biểu.
// Admin bật/tắt các quyền dưới đây cho từng vai trò (trừ admin) trong bảng phân quyền.
const PERMISSIONS = Object.freeze([
  {
    key: 'students.view',
    group: 'Sinh viên',
    label: 'Xem hồ sơ toàn bộ sinh viên',
    description:
      'Danh sách sinh viên, hồ sơ 360° của mọi sinh viên (không chỉ lớp được phân công).',
    defaultRoles: ['manager'],
  },
  {
    key: 'attendance.take',
    group: 'Điểm danh',
    label: 'Điểm danh lớp học',
    description:
      'Điểm danh học phần mình dạy, chỉ trong giờ học theo thời khóa biểu; được sửa đến hết ngày.',
    defaultRoles: ['teacher'],
  },
  {
    key: 'attendance.override',
    group: 'Điểm danh',
    label: 'Điểm danh / sửa điểm danh ngoài giờ',
    description: 'Ghi, sửa, xóa điểm danh của mọi học phần vào bất kỳ ngày nào (xử lý ngoại lệ).',
    defaultRoles: ['manager'],
  },
  {
    key: 'courses.manage',
    group: 'Điểm danh',
    label: 'Quản lý nhóm học phần & thời khóa biểu',
    description:
      'Thêm, sửa, xóa nhóm học phần, giờ học, số tiết; thêm sinh viên hoặc cả lớp vào nhóm.',
    defaultRoles: ['manager'],
  },
  {
    key: 'excel.import',
    group: 'Sinh viên',
    label: 'Quản lý dữ liệu sinh viên & nhập / xuất Excel',
    description:
      'Thêm, sửa, xóa sinh viên; tải biểu mẫu, nhập dữ liệu sinh viên và nhóm học phần từ Excel.',
    defaultRoles: ['manager'],
  },
  {
    key: 'callTasks.update',
    group: 'Chăm sóc sinh viên',
    label: 'Chăm sóc sinh viên lớp được phân công',
    description:
      'Gọi điện, cập nhật kết quả, lý do vắng, lịch gọi lại cho sinh viên các lớp mình phụ trách.',
    defaultRoles: ['staff'],
  },
  {
    key: 'callTasks.viewAll',
    group: 'Chăm sóc sinh viên',
    label: 'Giám sát mọi nhiệm vụ gọi điện',
    description: 'Xem nhiệm vụ gọi điện của tất cả nhân viên.',
    defaultRoles: ['manager'],
  },
  {
    key: 'classes.assign',
    group: 'Chăm sóc sinh viên',
    label: 'Phân lớp phụ trách cho nhân viên CSKH',
    description:
      'Giao / chuyển lớp hành chính cho nhân viên (có lưu lịch sử), xử lý hàng chờ cuộc gọi chưa phân công.',
    defaultRoles: ['manager'],
  },
  {
    key: 'warnings.configure',
    group: 'Chăm sóc sinh viên',
    label: 'Cấu hình mức cảnh báo & danh mục chăm sóc',
    description:
      'Các mức cảnh báo vắng (ngưỡng, màu sắc, mức cấm thi), lý do vắng, nhãn sinh viên.',
    defaultRoles: ['manager'],
  },
  {
    key: 'tasks.manage',
    group: 'Giao việc',
    label: 'Giao và duyệt nhiệm vụ',
    description: 'Giao việc cho nhân viên CSKH, duyệt minh chứng, đánh giá hiệu suất bằng AI.',
    defaultRoles: ['manager'],
  },
  {
    key: 'reports.view',
    group: 'Báo cáo',
    label: 'Xem thống kê & xuất báo cáo',
    description:
      'Thống kê chuyên cần, cảnh báo vắng, xuất báo cáo chăm sóc (.xlsx). Nhân viên CSKH chỉ thấy lớp mình phụ trách.',
    defaultRoles: ['manager', 'staff'],
  },
  {
    key: 'ai.chat',
    group: 'Báo cáo',
    label: 'Trợ lý AI phân tích dữ liệu toàn trường',
    description: 'Hỏi đáp với trợ lý AI về tình hình điểm danh và chăm sóc sinh viên toàn trường.',
    defaultRoles: ['manager'],
  },
]);
const PERMISSION_KEYS = Object.freeze(PERMISSIONS.map((p) => p.key));
// Vai trò có thể phân quyền; admin có bộ quyền cố định (chỉ xem) + các chức năng hệ thống.
const CONFIGURABLE_ROLES = Object.freeze(['manager', 'staff', 'teacher']);
const ADMIN_PERMISSIONS = Object.freeze([
  'students.view',
  'callTasks.viewAll',
  'reports.view',
  'ai.chat',
]);
const DEFAULT_ROLE_PERMISSIONS = Object.freeze(
  Object.fromEntries(
    CONFIGURABLE_ROLES.map((role) => [
      role,
      Object.freeze(PERMISSIONS.filter((p) => p.defaultRoles.includes(role)).map((p) => p.key)),
    ]),
  ),
);

// --- Thời khóa biểu & điểm danh
// Giờ học mặc định theo ca khi học phần chưa nhập giờ riêng (HH:mm, giờ địa phương máy chủ).
const DEFAULT_SHIFT_TIMES = Object.freeze({
  sang: Object.freeze({ startTime: '07:00', endTime: '11:30' }),
  chieu: Object.freeze({ startTime: '13:00', endTime: '17:30' }),
  toi: Object.freeze({ startTime: '18:00', endTime: '21:00' }),
});
const DEFAULT_PERIODS_PER_SESSION = 4;
// Giảng viên được mở điểm danh sớm hơn giờ vào lớp bấy nhiêu phút.
const ATTENDANCE_EARLY_MINUTES = 10;

// --- Mức cảnh báo vắng mặc định (Trưởng phòng / PHT tự cấu hình lại).
// unit: 'percent' = % tổng số tiết của học phần; 'periods' = số tiết nghỉ. Mức sau nặng hơn mức trước.
const WARNING_UNITS = Object.freeze(['percent', 'periods']);
const DEFAULT_WARNING_LEVELS = Object.freeze([
  Object.freeze({
    name: 'Nhắc nhở',
    unit: 'percent',
    threshold: 10,
    color: '#eab308',
    examBan: false,
  }),
  Object.freeze({
    name: 'Báo phụ huynh',
    unit: 'percent',
    threshold: 15,
    color: '#f97316',
    examBan: false,
  }),
  Object.freeze({
    name: 'Cấm thi',
    unit: 'percent',
    threshold: 20,
    color: '#dc2626',
    examBan: true,
  }),
]);

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
  PERMISSIONS,
  PERMISSION_KEYS,
  CONFIGURABLE_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  ADMIN_PERMISSIONS,
  DEFAULT_SHIFT_TIMES,
  DEFAULT_PERIODS_PER_SESSION,
  ATTENDANCE_EARLY_MINUTES,
  WARNING_UNITS,
  DEFAULT_WARNING_LEVELS,
  SUBSCRIPTION_PLANS,
  ORDER_STATUS,
  ORDER_STATUS_LABEL,
  ORDER_STATUSES,
  LABELS,
  toLabel,
};
