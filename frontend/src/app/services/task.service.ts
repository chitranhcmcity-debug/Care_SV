import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { WorkTask, TaskStatus } from '../models/types';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root',
})
export class TaskService {
  private readonly apiUrl = inject(API_BASE_URL) + '/tasks';

  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);

  /** Admin: assign a new task to a staff member. */
  createTask(payload: {
    title: string;
    description: string;
    assignedTo: string;
    dueDate?: string | null;
  }): Observable<{ message: string; task: WorkTask }> {
    return this.http.post<{ message: string; task: WorkTask }>(this.apiUrl, payload);
  }

  /** Admin: cancel/delete a task. */
  deleteTask(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  /** Admin: every task in the system, optionally filtered. */
  getAllTasks(filters?: { status?: TaskStatus; assignedTo?: string }): Observable<WorkTask[]> {
    let params = new HttpParams();
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.assignedTo) params = params.set('assignedTo', filters.assignedTo);
    return this.http.get<WorkTask[]>(`${this.apiUrl}/admin-all`, { params });
  }

  /** Staff: tasks assigned to me. */
  getMyTasks(status?: TaskStatus): Observable<WorkTask[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<WorkTask[]>(`${this.apiUrl}/my-tasks`, { params });
  }

  /** Staff: badge count of tasks needing action (new or rejected). */
  getPendingCount(): Observable<{ pendingCount: number }> {
    return this.http.get<{ pendingCount: number }>(`${this.apiUrl}/pending-count`);
  }

  /** Staff: confirm receipt of a newly assigned task. */
  acknowledgeTask(id: string): Observable<{ message: string; task: WorkTask }> {
    return this.http.put<{ message: string; task: WorkTask }>(
      `${this.apiUrl}/${id}/acknowledge`,
      {},
    );
  }

  /** Staff: submit completion evidence — any mix of note, link and files. */
  submitEvidence(
    id: string,
    evidence: { note?: string; link?: string; files?: File[] },
  ): Observable<{ message: string; task: WorkTask }> {
    const form = new FormData();
    if (evidence.note) form.append('note', evidence.note);
    if (evidence.link) form.append('link', evidence.link);
    for (const file of evidence.files || []) form.append('files', file);
    return this.http.put<{ message: string; task: WorkTask }>(`${this.apiUrl}/${id}/submit`, form);
  }

  /** Admin: approve (close) or reject (send back) a submitted task. */
  reviewTask(
    id: string,
    approve: boolean,
    reviewNote?: string,
  ): Observable<{ message: string; task: WorkTask }> {
    return this.http.put<{ message: string; task: WorkTask }>(`${this.apiUrl}/${id}/review`, {
      approve,
      reviewNote,
    });
  }

  /** Open one evidence file in a new tab. It's fetched as a blob because the auth header is
   *  only added by the interceptor for XHR/fetch, not for plain <a>/<img> navigation. */
  openEvidence(taskId: string, fileId: string): void {
    this.http
      .get(`${this.apiUrl}/${taskId}/evidence/${fileId}`, { responseType: 'blob' })
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        },
        error: () => this.notify.error('Không thể tải tệp minh chứng'),
      });
  }
}
