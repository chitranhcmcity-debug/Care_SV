import { CourseGroup, Student } from './types';

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
  isAtRisk: boolean;
  callStatus: string | null;
  callNote: string | null;
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
  examBanThreshold: number;
  summary: StudentSummary[];
}

export interface SubmitAttendanceResult {
  message: string;
  attendance: { _id: string; courseGroupId: string; date: string; absentStudents: string[] };
  isUpdate: boolean;
  createdTasksCount: number;
  taskAssignments: {
    staffName: string;
    studentName: string;
    studentCode: string;
    classCode: string;
  }[];
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
