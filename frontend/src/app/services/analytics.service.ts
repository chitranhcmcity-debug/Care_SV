import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AnalyticsSummary {
  metrics: {
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    retryTasks: number;
    examBanRiskCount: number;
  };
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
