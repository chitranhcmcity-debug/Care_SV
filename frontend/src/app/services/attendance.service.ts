import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CourseGroup, Student } from '../models/types';

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
  attendance: any;
  createdTasksCount: number;
  taskAssignments: { staffName: string; studentName: string; studentCode: string }[];
}

export interface ScheduleSession {
  scheduledDate: string;
  status: 'recorded' | 'missing' | 'future';
  attendance: AttendanceHistoryItem | null;
}

export interface ScheduleData {
  hasDates: boolean;
  sessions: ScheduleSession[];
  courseGroup: any;
}

@Injectable({
  providedIn: 'root',
})
export class AttendanceService {
  private get apiUrl(): string {
    const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
    return `http://${host}:5000/api/attendance`;
  }

  constructor(private http: HttpClient) {}

  getCourseGroups(showAll = false): Observable<CourseGroup[]> {
    const url = showAll ? `${this.apiUrl}/course-groups?all=true` : `${this.apiUrl}/course-groups`;
    return this.http.get<CourseGroup[]>(url);
  }

  submitAttendance(payload: { courseGroupId: string; absentStudentIds: string[]; excusedStudents?: { studentId: string; reason: string }[]; date?: string }): Observable<SubmitAttendanceResult> {
    return this.http.post<SubmitAttendanceResult>(`${this.apiUrl}/submit`, payload);
  }

  getAttendanceHistory(courseGroupId: string): Observable<AttendanceHistoryItem[]> {
    return this.http.get<AttendanceHistoryItem[]>(`${this.apiUrl}/history/${courseGroupId}`);
  }

  updateAttendanceHistory(attendanceId: string, absentStudentIds: string[], excusedStudents?: { studentId: string; reason: string }[]): Observable<any> {
    return this.http.put(`${this.apiUrl}/history/${attendanceId}`, { absentStudentIds, excusedStudents });
  }

  deleteAttendanceRecord(attendanceId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/history/${attendanceId}`);
  }

  getAttendanceSummary(courseGroupId: string): Observable<AttendanceSummary> {
    return this.http.get<AttendanceSummary>(`${this.apiUrl}/summary/${courseGroupId}`);
  }

  getTodayAttendance(courseGroupId: string): Observable<AttendanceHistoryItem | null> {
    return this.http.get<AttendanceHistoryItem | null>(`${this.apiUrl}/today/${courseGroupId}`);
  }

  getScheduleSessions(courseGroupId: string): Observable<ScheduleData> {
    return this.http.get<ScheduleData>(`${this.apiUrl}/schedule/${courseGroupId}`);
  }
}
