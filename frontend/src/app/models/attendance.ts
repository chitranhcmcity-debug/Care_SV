import { CourseGroup, Student, WarningLevel } from './types';

export interface ExcusedStudentItem {
  studentId: Student | string;
  reason?: string;
}

export interface AttendanceHistoryItem {
  _id: string;
  courseGroupId: string;
  date: string;
  absentStudents: Student[];
  excusedStudents?: ExcusedStudentItem[];
  recordedBy?: {
    fullName: string;
    email: string;
  };
  createdAt?: string;
}

export interface StudentSummary {
  student: Student;
  totalSessions: number;
  absentCount: number;
  excusedCount?: number;
  attendCount: number;
  attendRate: number;
  /** Số tiết vắng (số buổi x số tiết mỗi buổi), tỷ lệ trên tổng số tiết của học phần. */
  absentPeriods: number;
  absentPercent: number | null;
  warningLevel: WarningLevel | null;
  /** Đạt mức được đánh dấu cấm thi. */
  isAtRisk: boolean;
  /** Hồ sơ chăm sóc gần nhất của sinh viên (đang mở hoặc đã đóng). */
  careCaseId: string | null;
  careStatus: string | null;
  assignedStaff: string | null;
}

export interface AttendanceSummary {
  courseGroup: {
    _id: string;
    groupCode: string;
    courseName: string;
    shift: string;
    room: string;
  };
  totalSessions: number;
  periodsPerSession: number;
  totalPeriods: number | null;
  warningLevels: WarningLevel[];
  summary: StudentSummary[];
}

export interface SubmitAttendanceResult {
  message: string;
  attendance: { _id: string; courseGroupId: string; date: string; absentStudents: string[] };
  isUpdate: boolean;
  /** Các sinh viên vắng, để giảng viên có thể gọi (tùy chọn). */
  absentStudents: {
    _id: string;
    studentCode: string;
    fullName: string;
    classCode: string;
    phone?: string;
    parentPhone?: string;
  }[];
  /** Sinh viên đạt mức cảnh báo và đã có hồ sơ chăm sóc. */
  openedCases: { caseId: string; studentName: string; studentCode: string; level: string }[];
}

export interface ScheduleSession {
  scheduledDate: string;
  status: 'recorded' | 'missing' | 'future';
  attendance: AttendanceHistoryItem | null;
}

export interface ScheduleData {
  hasDates: boolean;
  sessions: ScheduleSession[];
  courseGroup: CourseGroup;
}

export interface SubmitAttendancePayload {
  courseGroupId: string;
  absentStudentIds: string[];
  excusedStudents?: { studentId: string; reason: string }[];
  date?: string;
}
