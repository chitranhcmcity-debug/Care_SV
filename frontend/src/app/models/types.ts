/** manager = Trưởng phòng / Phó hiệu trưởng. */
export type Role = 'admin' | 'manager' | 'staff' | 'teacher';
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Quản trị viên',
  manager: 'Trưởng phòng / Phó hiệu trưởng',
  staff: 'Nhân viên CSKH',
  teacher: 'Giảng viên',
};
/** Permission keys an admin can grant per role (mirrors PERMISSIONS in backend/utils/hangSo.js).
 *  The admin itself holds a fixed view-only set (ADMIN_PERMISSIONS in the backend). */
export type Permission =
  | 'students.view'
  | 'attendance.take'
  | 'attendance.override'
  | 'courses.manage'
  | 'excel.import'
  | 'care.work'
  | 'care.manage'
  | 'care.propose'
  | 'recordings.viewAll'
  | 'classes.assign'
  | 'warnings.configure'
  | 'tasks.manage'
  | 'reports.view'
  | 'ai.chat';
export type ConfigurableRole = Exclude<Role, 'admin'>;
export type PermissionMatrix = Record<ConfigurableRole, Permission[]>;

export interface PermissionConfig {
  permissions: {
    key: Permission;
    group: string;
    label: string;
    description: string;
    /** Roles the permission can work for; null = every role. */
    onlyRoles?: ConfigurableRole[] | null;
  }[];
  roles: { role: ConfigurableRole; label: string }[];
  defaults: PermissionMatrix;
  matrix: PermissionMatrix;
}

export interface User {
  id?: string;
  _id?: string;
  fullName: string;
  email: string;
  role: Role;
  status: 'active' | 'inactive' | 'pending' | 'awaiting_key' | 'unverified';
  managedClasses?: string[];
}

export interface Student {
  _id: string;
  studentCode: string;
  fullName: string;
  classCode: string;
  dob?: string;
  major?: string;
  phone?: string;
  parentPhone?: string;
  courseGroups?: string[];
  tags?: string[];
}

export interface CourseGroup {
  _id: string;
  classCode?: string;
  courseCode?: string;
  courseName?: string;
  groupCode: string;
  shift?: Shift;
  scheduleDays?: Weekday[];
  room?: string;
  /** HH:mm; empty = default hours of the shift. */
  startTime?: string;
  endTime?: string;
  /** 0 = default / computed from the schedule. */
  periodsPerSession?: number;
  totalPeriods?: number;
  startDate?: string;
  endDate?: string;
  teacherId?: User | string;
  teacherName?: string;
  students?: Student[];
}

export interface SystemSettings {
  _id?: string;
  systemTitle: string;
  schoolName: string;
  departmentName: string;
  supportHotline: string;
  supportEmail: string;
  logoDataUrl?: string;
  primaryColor?: string;
  warningLevels: WarningLevel[];
  absenceReasons: string[];
  tags: string[];
}

/** Absence warning level configured by the manager; levels are ordered mildest first. */
export interface WarningLevel {
  name: string;
  /** 'percent' = % of the course's total periods; 'periods' = number of periods missed. */
  unit: 'percent' | 'periods';
  threshold: number;
  color: string;
  examBan: boolean;
}

/** Absence figures of one student in one course group. */
export interface AbsenceWarning {
  absentPeriods: number;
  absentPercent: number | null;
  warningLevel: WarningLevel | null;
  isAtRisk: boolean;
}

export interface AttendanceWindow {
  open: boolean;
  reason: string;
  startTime: string;
  endTime: string;
  canOverride: boolean;
}

export interface ClassAssignmentOverview {
  classes: {
    classCode: string;
    studentCount: number;
    staff: { _id: string; fullName: string } | null;
    since: string | null;
  }[];
  staffs: {
    _id: string;
    fullName: string;
    email: string;
    status: User['status'];
    managedClasses: string[];
    openCases: number;
  }[];
  awaitingCases: number;
}

export interface ClassAssignmentRecord {
  _id: string;
  classCode: string;
  staffId: string;
  staffName: string;
  assignedBy?: { fullName: string } | null;
  startedAt: string;
  active: boolean;
  endedAt?: string | null;
  endedBy?: { fullName: string } | null;
  endReason?: string;
}

export interface IntegrationItem {
  key: string;
  group: string;
  label: string;
  secret: boolean;
  placeholder?: string;
  /** Values accepted (rendered as a dropdown). */
  allowed?: string[];
  /** AI provider this field belongs to; shown only when that provider is selected. */
  provider?: string;
  source: 'database' | 'env' | 'none';
  value: string;
}

export interface TimelineItem {
  type: 'care_case' | 'call' | 'attendance';
  date: string;
  title: string;
  courseGroup?: CourseGroup;
  staff?: { fullName: string; email?: string };
  status: string;
  note?: string;
  caseId?: string;
  stepsDone?: number;
  stepsTotal?: number;
}

// Stored values are unaccented codes mirroring backend/utils/hangSo.js; VI_LABELS holds the
// Vietnamese display text (render with the viLabel pipe).
export const TASK_STATUS = {
  PENDING: 'moi_giao',
  ACKNOWLEDGED: 'da_xac_nhan',
  SUBMITTED: 'cho_duyet',
  COMPLETED: 'hoan_thanh',
  REJECTED: 'bi_tu_choi',
} as const;
export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

/** Loại công việc (mirrors TASK_CATEGORY_LABEL in the backend). */
export const TASK_CATEGORY_LABELS = {
  hanh_chinh: 'Hành chính - Văn thư',
  dao_tao: 'Đào tạo - Học vụ',
  tuyen_sinh: 'Tuyển sinh - Truyền thông',
  cong_tac_sv: 'Công tác sinh viên',
  cham_soc_sv: 'Chăm sóc sinh viên',
  su_kien: 'Sự kiện - Hoạt động',
  bao_cao: 'Báo cáo - Thống kê',
  khac: 'Công việc khác',
} as const;
export type TaskCategory = keyof typeof TASK_CATEGORY_LABELS;
export const TASK_CATEGORIES = Object.keys(TASK_CATEGORY_LABELS) as TaskCategory[];

/** Mức độ ưu tiên (mirrors TASK_PRIORITY_LABEL in the backend). */
export const TASK_PRIORITY_LABELS = {
  thap: 'Thấp',
  trung_binh: 'Trung bình',
  cao: 'Cao',
  khan_cap: 'Khẩn cấp',
} as const;
export type TaskPriority = keyof typeof TASK_PRIORITY_LABELS;
export const TASK_PRIORITIES = Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[];

/** Hồ sơ chăm sóc (mirrors CARE_STATUS in the backend). */
export const CARE_STATUS = {
  AWAITING: 'cho_chi_dao',
  IN_PROGRESS: 'dang_cham_soc',
  CLOSING: 'cho_duyet_ket_thuc',
  CLOSED: 'da_ket_thuc',
} as const;
export type CareStatus = (typeof CARE_STATUS)[keyof typeof CARE_STATUS];
export const CARE_STATUS_LABELS: Record<CareStatus, string> = {
  cho_chi_dao: 'Chờ chỉ đạo',
  dang_cham_soc: 'Đang chăm sóc',
  cho_duyet_ket_thuc: 'Chờ duyệt kết thúc',
  da_ket_thuc: 'Đã kết thúc',
};
export const CARE_SOURCE_LABELS = {
  canh_bao: 'Cảnh báo vắng học',
  de_xuat: 'Đề xuất chăm sóc',
  giao_viec: 'Chỉ đạo từ giao việc',
} as const;
export type CareSource = keyof typeof CARE_SOURCE_LABELS;
export const CARE_RESULT_LABELS = {
  tien_bo: 'Đã tiến bộ, đi học đều',
  on_dinh: 'Ổn định, tiếp tục theo dõi',
  khong_tien_bo: 'Chưa tiến bộ',
  nghi_hoc: 'Đã nghỉ học / bảo lưu',
} as const;
export type CareResult = keyof typeof CARE_RESULT_LABELS;

export const SHIFT = { MORNING: 'sang', AFTERNOON: 'chieu', EVENING: 'toi' } as const;
export type Shift = (typeof SHIFT)[keyof typeof SHIFT];

// Indexed by Date#getDay() (0 = Sunday).
export const WEEKDAYS_BY_JS_DAY = [
  'chu_nhat',
  'thu_2',
  'thu_3',
  'thu_4',
  'thu_5',
  'thu_6',
  'thu_7',
] as const;
export type Weekday = (typeof WEEKDAYS_BY_JS_DAY)[number];
export const DEFAULT_SCHEDULE_DAYS: Weekday[] = ['thu_2', 'thu_4', 'thu_6'];

export const VI_LABELS: Record<string, string> = {
  ...TASK_CATEGORY_LABELS,
  ...TASK_PRIORITY_LABELS,
  moi_giao: 'Mới giao',
  da_xac_nhan: 'Đã xác nhận',
  cho_duyet: 'Chờ duyệt',
  hoan_thanh: 'Hoàn thành',
  bi_tu_choi: 'Bị từ chối',
  ...CARE_STATUS_LABELS,
  ...CARE_SOURCE_LABELS,
  ...CARE_RESULT_LABELS,
  nghe_may: 'Nghe máy',
  khong_nghe_may: 'Không nghe máy',
  may_ban: 'Máy bận',
  sai_so: 'Sai số',
  sang: 'Sáng',
  chieu: 'Chiều',
  toi: 'Tối',
  thu_2: 'Thứ 2',
  thu_3: 'Thứ 3',
  thu_4: 'Thứ 4',
  thu_5: 'Thứ 5',
  thu_6: 'Thứ 6',
  thu_7: 'Thứ 7',
  chu_nhat: 'Chủ Nhật',
};

export interface TaskEvidenceFile {
  _id: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface WorkTask {
  _id: string;
  title: string;
  description: string;
  assignedBy: { fullName: string; email: string } | string;
  assignedTo: { fullName: string; email: string } | string;
  dueDate?: string | null;
  status: TaskStatus;
  category?: TaskCategory;
  priority?: TaskPriority;
  progress?: number;
  progressLog?: { percent: number; note: string; at: string }[];
  reviewScore?: number | null;
  reworkCount?: number;
  evidenceNote?: string;
  evidenceLink?: string;
  evidenceFiles?: TaskEvidenceFile[];
  reviewNote?: string;
  reviewedBy?: { fullName: string; email: string } | string | null;
  acknowledgedAt?: string | null;
  submittedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** One row of GET /api/tasks/staff-progress (see backend services/dichVuTienDoNhanVien.js). */
export interface StaffProgressRow {
  staff: { _id: string; fullName: string; email: string; status: string };
  tasks: {
    total: number;
    byStatus: Record<TaskStatus, number>;
    open: number;
    waitingReview: number;
    completed: number;
    overdue: number;
    completedOnTime: number;
    completedLate: number;
    urgentOpen: number;
    avgProgress: number | null;
    avgScore: number | null;
    scoredCount: number;
    reworkCount: number;
    avgCompletionDays: number | null;
    byCategory: Partial<Record<TaskCategory, { total: number; completed: number }>>;
  };
  /** Care cases assigned in the period. */
  care: {
    total: number;
    inProgress: number;
    closing: number;
    closed: number;
    /** Closed with the student improved or stable. */
    improved: number;
    stepsDone: number;
    stepsTotal: number;
  };
  /** Percentages 0–100, null = no data for that part. */
  rates: {
    completion: number | null;
    onTime: number | null;
    quality: number | null;
    care: number | null;
  };
  kpiScore: number | null;
  kpiRating: string;
}

export interface Student360Profile {
  student: Student;
  timeline: TimelineItem[];
  totalAbsences: number;
  totalCalls: number;
  totalCases: number;
}
