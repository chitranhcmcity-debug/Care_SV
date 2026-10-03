// Stored values are unaccented codes; the *_LABEL maps hold the Vietnamese display text.

// --- Hồ sơ chăm sóc sinh viên
// cho_chi_dao: waiting for Trưởng phòng / PHT to direct a staff member (no default owner, or
// proposed by hand); dang_cham_soc: the assigned staff member is working on it;
// cho_duyet_ket_thuc: staff asked to close it, waiting for approval; da_ket_thuc: closed, in history.
const CARE_STATUS = Object.freeze({
  AWAITING: 'cho_chi_dao',
  IN_PROGRESS: 'dang_cham_soc',
  CLOSING: 'cho_duyet_ket_thuc',
  CLOSED: 'da_ket_thuc',
});
const CARE_STATUS_LABEL = Object.freeze({
  [CARE_STATUS.AWAITING]: 'Chờ chỉ đạo',
  [CARE_STATUS.IN_PROGRESS]: 'Đang chăm sóc',
  [CARE_STATUS.CLOSING]: 'Chờ duyệt kết thúc',
  [CARE_STATUS.CLOSED]: 'Đã kết thúc',
});
const CARE_STATUSES = Object.freeze(Object.values(CARE_STATUS));
const OPEN_CARE_STATUSES = Object.freeze([
  CARE_STATUS.AWAITING,
  CARE_STATUS.IN_PROGRESS,
  CARE_STATUS.CLOSING,
]);
// Why the case was opened.
const CARE_SOURCE_LABEL = Object.freeze({
  canh_bao: 'Cảnh báo vắng học',
  de_xuat: 'Đề xuất chăm sóc',
  giao_viec: 'Chỉ đạo từ giao việc',
});
const CARE_SOURCES = Object.freeze(Object.keys(CARE_SOURCE_LABEL));
// Result recorded when a case is closed.
const CARE_RESULT_LABEL = Object.freeze({
  tien_bo: 'Đã tiến bộ, đi học đều',
  on_dinh: 'Ổn định, tiếp tục theo dõi',
  khong_tien_bo: 'Chưa tiến bộ',
  nghi_hoc: 'Đã nghỉ học / bảo lưu',
});
const CARE_RESULTS = Object.freeze(Object.keys(CARE_RESULT_LABEL));
// Steps every new case starts with; the manager, the staff member or AI Care can add more.
const DEFAULT_CARE_STEPS = Object.freeze([
  'Liên hệ sinh viên / phụ huynh',
  'Tìm hiểu nguyên nhân',
  'Đưa ra hướng giải quyết',
  'Theo dõi chuyển biến sau chăm sóc',
]);
// Kinds of entries in a case's exchange between staff and managers.
const CARE_NOTE_KINDS = Object.freeze(['trao_doi', 'kho_khan', 'chi_dao', 'su_kien', 'cuoc_goi']);

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
// Việc chưa xong mà nhân viên còn phải làm (chưa tính việc đã nộp chờ duyệt).
const OPEN_TASK_STATUSES = Object.freeze([
  TASK_STATUS.PENDING,
  TASK_STATUS.ACKNOWLEDGED,
  TASK_STATUS.REJECTED,
]);

// --- Loại công việc (nghiệp vụ thực tế của phòng, không chỉ gọi điện chăm sóc)
const TASK_CATEGORY_LABEL = Object.freeze({
  hanh_chinh: 'Hành chính - Văn thư',
  dao_tao: 'Đào tạo - Học vụ',
  tuyen_sinh: 'Tuyển sinh - Truyền thông',
  cong_tac_sv: 'Công tác sinh viên',
  cham_soc_sv: 'Chăm sóc sinh viên',
  su_kien: 'Sự kiện - Hoạt động',
  bao_cao: 'Báo cáo - Thống kê',
  khac: 'Công việc khác',
});
const TASK_CATEGORIES = Object.freeze(Object.keys(TASK_CATEGORY_LABEL));

// --- Mức độ ưu tiên công việc
const TASK_PRIORITY_LABEL = Object.freeze({
  thap: 'Thấp',
  trung_binh: 'Trung bình',
  cao: 'Cao',
  khan_cap: 'Khẩn cấp',
});
const TASK_PRIORITIES = Object.freeze(Object.keys(TASK_PRIORITY_LABEL));

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
  staff: 'Nhân viên CSSV',
  teacher: 'Giảng viên',
});

// --- Phân quyền theo vai trò
// Mô hình vai trò:
// - Admin: quản trị hệ thống (tài khoản, phân quyền, cấu hình hệ thống / API / giao diện, gói
//   dịch vụ). Được XEM dữ liệu nghiệp vụ (ADMIN_PERMISSIONS) nhưng không thao tác nghiệp vụ.
// - Trưởng phòng / Phó hiệu trưởng: giao việc, phân lớp cho CSSV, cấu hình mức cảnh báo, tổng quan.
// - Nhân viên CSSV: chăm sóc sinh viên thuộc các lớp hành chính được phân công.
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
    key: 'excel.import',
    group: 'Sinh viên',
    label: 'Quản lý dữ liệu sinh viên & nhập / xuất Excel',
    description:
      'Thêm, sửa, xóa sinh viên; tải biểu mẫu, nhập dữ liệu sinh viên và nhóm học phần từ Excel.',
    defaultRoles: ['manager'],
  },
  {
    key: 'attendance.take',
    group: 'Điểm danh',
    label: 'Điểm danh lớp học',
    description:
      'Điểm danh học phần mình dạy, chỉ trong giờ học theo thời khóa biểu; hết giờ học thì điểm danh được chốt, không sửa được nữa.',
    defaultRoles: ['teacher'],
    // Only a teacher can be the lecturer of a course group, so the right means nothing elsewhere.
    onlyRoles: ['teacher'],
  },
  {
    key: 'attendance.view',
    group: 'Điểm danh',
    label: 'Xem sổ điểm danh mọi học phần',
    description:
      'Xem (không ghi, không sửa) điểm danh và tổng hợp vắng của mọi học phần. Chỉ giảng viên điểm danh, trong giờ học.',
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
    key: 'care.work',
    group: 'Chăm sóc sinh viên',
    label: 'Chăm sóc sinh viên theo hồ sơ được giao',
    description:
      'Nhận hồ sơ chăm sóc, gọi điện, cập nhật các bước, trao đổi với cấp quản lý, đề nghị kết thúc hồ sơ.',
    defaultRoles: ['staff'],
    // Care cases are only ever assigned to Nhân viên CSSV.
    onlyRoles: ['staff'],
  },
  {
    key: 'care.manage',
    group: 'Chăm sóc sinh viên',
    label: 'Chỉ đạo & duyệt hồ sơ chăm sóc',
    description:
      'Xem mọi hồ sơ, chỉ đạo nhân viên chăm sóc, tạo các bước, phản hồi và duyệt kết thúc hồ sơ.',
    defaultRoles: ['manager'],
  },
  {
    key: 'care.propose',
    group: 'Chăm sóc sinh viên',
    label: 'Đề xuất chăm sóc sinh viên',
    description: 'Đề xuất mở hồ sơ chăm sóc cho sinh viên có dấu hiệu nghỉ nhiều hoặc bỏ học.',
    defaultRoles: ['staff', 'teacher'],
  },
  {
    key: 'recordings.viewAll',
    group: 'Chăm sóc sinh viên',
    label: 'Nghe mọi bản ghi âm cuộc gọi',
    description:
      'Nghe lại ghi âm cuộc gọi của mọi người. Không có quyền này thì chỉ nghe được cuộc gọi của mình.',
    defaultRoles: ['manager'],
  },
  {
    key: 'classes.assign',
    group: 'Chăm sóc sinh viên',
    label: 'Phân lớp phụ trách cho nhân viên CSSV',
    description:
      'Giao / chuyển lớp hành chính cho nhân viên (có lưu lịch sử). Hồ sơ chăm sóc của sinh viên lớp đó mặc định giao cho nhân viên phụ trách lớp.',
    defaultRoles: ['manager'],
  },
  {
    key: 'warnings.configure',
    group: 'Chăm sóc sinh viên',
    label: 'Cấu hình mức cảnh báo & danh mục chăm sóc',
    description:
      'Các mức cảnh báo vắng (ngưỡng, màu sắc) dùng để mở hồ sơ chăm sóc, lý do vắng, nhãn sinh viên.',
    defaultRoles: ['manager'],
  },
  {
    key: 'tasks.manage',
    group: 'Giao việc',
    label: 'Giao và duyệt nhiệm vụ',
    description: 'Giao việc cho nhân viên CSSV, duyệt minh chứng, đánh giá hiệu suất bằng AI.',
    defaultRoles: ['manager'],
  },
  {
    key: 'reports.view',
    group: 'Báo cáo',
    label: 'Xem thống kê & xuất báo cáo',
    description:
      'Thống kê chuyên cần, cảnh báo vắng, xuất báo cáo chăm sóc (.xlsx). Nhân viên CSSV chỉ thấy lớp mình phụ trách.',
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
// Keys granted from older stored matrices that predate them: new key -> the old keys it replaces.
const LEGACY_PERMISSIONS = Object.freeze({
  'care.work': ['callTasks.update'],
  'care.manage': ['callTasks.viewAll'],
  'recordings.viewAll': ['callTasks.viewAll'],
  'care.propose': ['callTasks.update', 'attendance.take'],
});
// Keys renamed in stored matrices: old key -> its replacement.
const RENAMED_PERMISSIONS = Object.freeze({ 'attendance.override': 'attendance.view' });
const PERMISSION_KEYS = Object.freeze(PERMISSIONS.map((p) => p.key));
/** Whether a permission can be granted to a role (onlyRoles limits it to roles where it works). */
const permissionAppliesTo = (key, role) => {
  const p = PERMISSIONS.find((item) => item.key === key);
  return Boolean(p) && (!p.onlyRoles || p.onlyRoles.includes(role));
};
// Vai trò có thể phân quyền; admin có bộ quyền cố định (chỉ xem) + các chức năng hệ thống.
const CONFIGURABLE_ROLES = Object.freeze(['manager', 'staff', 'teacher']);
const ADMIN_PERMISSIONS = Object.freeze([
  'students.view',
  'care.manage',
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

// Tin Zalo cảnh báo vắng gửi phụ huynh: gửi khi sinh viên vắng (không phép) quá
// PARENT_ALERT_WEEKLY_LIMIT buổi trong một tuần, cộng mọi học phần.
const PARENT_ALERT_WEEKLY_LIMIT = 2;
const PARENT_ALERT_STATUS = Object.freeze({
  SENT: 'da_gui',
  FAILED: 'gui_loi',
  NOT_CONFIGURED: 'chua_cau_hinh',
  NO_PHONE: 'thieu_sdt',
});
const PARENT_ALERT_STATUS_LABEL = Object.freeze({
  [PARENT_ALERT_STATUS.SENT]: 'Đã gửi',
  [PARENT_ALERT_STATUS.FAILED]: 'Gửi lỗi',
  [PARENT_ALERT_STATUS.NOT_CONFIGURED]: 'Chưa cấu hình Zalo',
  [PARENT_ALERT_STATUS.NO_PHONE]: 'Thiếu SĐT phụ huynh',
});
const PARENT_ALERT_STATUSES = Object.freeze(Object.values(PARENT_ALERT_STATUS));

// --- Nhãn hiển thị
// Every stored code is unique across these sets, so one lookup covers them all.
const LABELS = Object.freeze({
  ...CARE_STATUS_LABEL,
  ...CARE_SOURCE_LABEL,
  ...CARE_RESULT_LABEL,
  ...TASK_STATUS_LABEL,
  ...TASK_CATEGORY_LABEL,
  ...TASK_PRIORITY_LABEL,
  ...SHIFT_LABEL,
  ...WEEKDAY_LABEL,
  ...ORDER_STATUS_LABEL,
  ...PARENT_ALERT_STATUS_LABEL,
});

// Vietnamese display text for a stored code; unknown values pass through unchanged.
const toLabel = (value) => LABELS[value] ?? value;

module.exports = {
  CARE_STATUS,
  CARE_STATUS_LABEL,
  CARE_STATUSES,
  OPEN_CARE_STATUSES,
  CARE_SOURCE_LABEL,
  CARE_SOURCES,
  CARE_RESULT_LABEL,
  CARE_RESULTS,
  DEFAULT_CARE_STEPS,
  CARE_NOTE_KINDS,
  LEGACY_PERMISSIONS,
  RENAMED_PERMISSIONS,
  TASK_STATUS,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  OPEN_TASK_STATUSES,
  TASK_CATEGORY_LABEL,
  TASK_CATEGORIES,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITIES,
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
  permissionAppliesTo,
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
  PARENT_ALERT_WEEKLY_LIMIT,
  PARENT_ALERT_STATUS,
  PARENT_ALERT_STATUS_LABEL,
  PARENT_ALERT_STATUSES,
  LABELS,
  toLabel,
};
