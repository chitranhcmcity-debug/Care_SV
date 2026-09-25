import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { WarningLevel } from '../models/types';

export interface WarningRow {
  student: {
    _id: string;
    studentCode: string;
    fullName: string;
    classCode: string;
    major: string;
    phone?: string;
    parentPhone?: string;
  };
  courseCode: string;
  courseName?: string;
  absentCount: number;
  absentPeriods: number;
  absentPercent: number | null;
  warningLevel: WarningLevel;
  isAtRisk: boolean;
  lastCallStatus: string;
  lastCallNote: string;
  assignedStaff: string;
}

export interface AnalyticsSummary {
  metrics: {
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    retryTasks: number;
    unassignedTasks: number;
    examBanRiskCount: number;
    warningCount: number;
  };
  /** Configured levels (mildest first) with how many students reached each. */
  warningLevels: (WarningLevel & { count: number })[];
  warningList: WarningRow[];
  courseAbsenceStats: { courseCode: string; absentCount: number }[];
  reasonStats: { reason: string; count: number }[];
  examBanRiskList: {
    student: {
      _id: string;
      studentCode: string;
      fullName: string;
      classCode: string;
      major: string;
      phone?: string;
      parentPhone?: string;
    };
    courseCode: string;
    courseName?: string;
    absentCount: number;
    lastCallStatus: string;
    lastCallNote: string;
    assignedStaff: string;
  }[];
}

@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  private readonly apiUrl = inject(API_BASE_URL) + '/analytics';

  private readonly http = inject(HttpClient);

  getAnalyticsSummary(): Observable<AnalyticsSummary> {
    return this.http.get<AnalyticsSummary>(`${this.apiUrl}/summary`);
  }

  exportCareReport(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/export-care-report`, {
      responseType: 'blob',
    });
  }
}
