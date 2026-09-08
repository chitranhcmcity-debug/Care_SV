import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CallTask } from '../models/types';

@Injectable({
  providedIn: 'root',
})
export class CallTaskService {
  private readonly apiUrl = inject(API_BASE_URL) + '/call-tasks';

  private readonly http = inject(HttpClient);

  getUnreadCount(): Observable<{ unreadCount: number }> {
    return this.http.get<{ unreadCount: number }>(`${this.apiUrl}/unread-count`);
  }

  getMyTasks(filters?: {
    classCode?: string;
    groupCode?: string;
    status?: string;
  }): Observable<CallTask[]> {
    let params = new HttpParams();
    if (filters?.classCode) params = params.set('classCode', filters.classCode);
    if (filters?.groupCode) params = params.set('groupCode', filters.groupCode);
    if (filters?.status) params = params.set('status', filters.status);

    return this.http.get<CallTask[]>(`${this.apiUrl}/my-tasks`, { params });
  }

  updateTaskStatus(
    id: string,
    payload: {
      status?: 'Chưa gọi' | 'Không bắt máy' | 'Đã liên hệ';
      callNote?: string;
      absenceReasonCategory?: string;
      callbackDate?: string | null;
      tags?: string[];
    },
  ): Observable<{ message: string; task: CallTask }> {
    return this.http.put<{ message: string; task: CallTask }>(
      `${this.apiUrl}/${id}/update`,
      payload,
    );
  }

  getStudent360Profile(studentId: string): Observable<import('../models/types').Student360Profile> {
    return this.http.get<import('../models/types').Student360Profile>(
      `${this.apiUrl}/student-360/${studentId}`,
    );
  }

  updateStudentTags(
    studentId: string,
    tags: string[],
  ): Observable<{ message: string; tags: string[] }> {
    return this.http.put<{ message: string; tags: string[] }>(
      `${this.apiUrl}/student-tags/${studentId}`,
      { tags },
    );
  }
}
