import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CourseGroup } from '../models/types';

import {
  AttendanceHistoryItem,
  AttendanceSummary,
  SubmitAttendanceResult,
  ScheduleData,
  SubmitAttendancePayload,
} from '../models/attendance';
export type {
  ExcusedStudentItem,
  AttendanceHistoryItem,
  StudentSummary,
  AttendanceSummary,
  SubmitAttendanceResult,
  ScheduleSession,
  ScheduleData,
  SubmitAttendancePayload,
} from '../models/attendance';

@Injectable({
  providedIn: 'root',
})
export class AttendanceService {
  private readonly apiUrl = inject(API_BASE_URL) + '/attendance';

  private readonly http = inject(HttpClient);

  getCourseGroups(showAll = false): Observable<CourseGroup[]> {
    const url = showAll ? `${this.apiUrl}/course-groups?all=true` : `${this.apiUrl}/course-groups`;
    return this.http.get<CourseGroup[]>(url);
  }

  submitAttendance(payload: SubmitAttendancePayload): Observable<SubmitAttendanceResult> {
    return this.http.post<SubmitAttendanceResult>(`${this.apiUrl}/submit`, payload);
  }

  getAttendanceHistory(courseGroupId: string): Observable<AttendanceHistoryItem[]> {
    return this.http.get<AttendanceHistoryItem[]>(`${this.apiUrl}/history/${courseGroupId}`);
  }

  updateAttendanceHistory(
    attendanceId: string,
    absentStudentIds: string[],
    excusedStudents?: { studentId: string; reason: string }[],
  ): Observable<{ message: string; attendance: AttendanceHistoryItem }> {
    return this.http.put<{ message: string; attendance: AttendanceHistoryItem }>(
      `${this.apiUrl}/history/${attendanceId}`,
      { absentStudentIds, excusedStudents },
    );
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
