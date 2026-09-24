/** manager = Trưởng phòng / Phó hiệu trưởng. */
export type Role = 'admin' | 'manager' | 'staff' | 'teacher';
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Quản trị viên',
  manager: 'Trưởng phòng / Phó hiệu trưởng',
  staff: 'Nhân viên CSKH',
  teacher: 'Giảng viên',
};
/** Landing page after sign-in for each role. */
export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  manager: '/management',
  staff: '/call-tasks',
  teacher: '/attendance',
};

export interface User {
  id?: string;
  _id?: string;
  fullName: string;
  email: string;
  role: Role;
  status: 'active' | 'inactive' | 'unverified';
  managedClasses?: string[];
  managedStudents?: (Student | string)[];
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
  startDate?: string;
  endDate?: string;
  teacherId?: User | string;
  teacherName?: string;
  students?: Student[];
}

export interface CallTask {
  _id: string;
  student?: Student; // mapped from studentId
  studentId?: Student; // populated student object
  courseGroup?: CourseGroup; // mapped from courseGroupId
  courseGroupId?: CourseGroup;
  assignedStaff?: { fullName: string; email: string }; // admin-only
  absenceDate?: string;
  status?: CallStatus;
  callStatus: CallStatus;
  callNote: string;
  absenceReasonCategory?: string;
  callbackDate?: string | null;
  isCallbackDue?: boolean;
  callAttempts?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SystemSettings {
  _id?: string;
  systemTitle: string;
  schoolName: string;
  departmentName: string;
  supportHotline: string;
  supportEmail: string;
  examBanThreshold: number;
  parentWarningThreshold: number;
  taskAssignmentRule: 'round-robin' | 'least-tasks' | 'admin-only';
  absenceReasons: string[];
  tags: string[];
}

export interface TimelineItem {
  type: 'call_task' | 'attendance';
  date: string;
  title: string;
  courseGroup?: CourseGroup;
  staff?: { fullName: string; email?: string };
  status: string;
  note?: string;
  absenceReasonCategory?: string;
  callbackDate?: string;
  callAttempts?: number;
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

export const CALL_STATUS = {
  PENDING: 'chua_goi',
  UNREACHABLE: 'khong_bat_may',
  CONTACTED: 'da_lien_he',
} as const;
export type CallStatus = (typeof CALL_STATUS)[keyof typeof CALL_STATUS];

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
  moi_giao: 'Mới giao',
  da_xac_nhan: 'Đã xác nhận',
  cho_duyet: 'Chờ duyệt',
  hoan_thanh: 'Hoàn thành',
  bi_tu_choi: 'Bị từ chối',
  chua_goi: 'Chưa gọi',
  khong_bat_may: 'Không bắt máy',
  da_lien_he: 'Đã liên hệ',
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

export interface Student360Profile {
  student: Student;
  timeline: TimelineItem[];
  totalAbsences: number;
  totalCalls: number;
}
