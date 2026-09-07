import { Injectable } from '@angular/core';
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
  private get apiUrl(): string {
    const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
    return `http://${host}:5000/api/analytics`;
  }

  constructor(private http: HttpClient) {}

  getAnalyticsSummary(): Observable<AnalyticsSummary> {
    return this.http.get<AnalyticsSummary>(`${this.apiUrl}/summary`);
  }

  exportCareReport(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/export-care-report`, {
      responseType: 'blob',
    });
  }
}
