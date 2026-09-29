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
  /** Absent periods (sessions x periods per session), share of the course's total periods. */
  absentPeriods: number;
  absentPercent: number | null;
  warningLevel: WarningLevel | null;
  /** Reached a level marked as exam ban. */
  isAtRisk: boolean;
  /** Latest care case of the student (open or closed). */
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
  /** The absent students, so the lecturer may call them (optional). */
  absentStudents: {
    _id: string;
    studentCode: string;
    fullName: string;
    classCode: string;
    phone?: string;
    parentPhone?: string;
  }[];
  /** Students who reached a warning level and got a care case. */
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
