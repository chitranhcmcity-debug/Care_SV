import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api';

export type ParentAlertStatus = 'da_gui' | 'gui_loi' | 'chua_cau_hinh' | 'thieu_sdt';

/** One Zalo message to a parent about a week with too many absences. */
export interface ParentAlert {
  _id: string;
  studentId: { _id: string; fullName: string; studentCode: string; classCode: string } | null;
  weekStart: string;
  weekEnd: string;
  absentCount: number;
  courses: { groupCode: string; courseName: string; count: number; teacherName: string; teacherPhone: string }[];
  staffName: string;
  staffPhone: string;
  parentPhone: string;
  content: string;
  status: ParentAlertStatus;
  error: string;
  sentAt: string | null;
  attempts: number;
  createdAt: string;
}

export interface ParentAlertPage {
  items: ParentAlert[];
  total: number;
  page: number;
  pageSize: number;
  counts: Partial<Record<ParentAlertStatus, number>>;
}

/** Report of the absence-warning Zalo messages sent to parents. */
@Injectable({ providedIn: 'root' })
export class ParentAlertService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${inject(API_BASE_URL)}/parent-alerts`;

  list(page = 1, status = ''): Observable<ParentAlertPage> {
    const params: Record<string, string> = { page: String(page) };
    if (status) params['status'] = status;
    return this.http.get<ParentAlertPage>(this.apiUrl, { params });
  }

  resend(id: string): Observable<{ message: string; alert: ParentAlert }> {
    return this.http.post<{ message: string; alert: ParentAlert }>(`${this.apiUrl}/${id}/resend`, {});
  }
}
