import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { WorkTask, TaskStatus } from '../models/types';

@Injectable({
  providedIn: 'root',
})
export class TaskService {
  private readonly apiUrl = inject(API_BASE_URL) + '/tasks';

  private readonly http = inject(HttpClient);

  /** Admin: assign a new task to a staff member. */
  createTask(payload: {
    title: string;
    description: string;
    assignedTo: string;
    dueDate?: string | null;
  }): Observable<{ message: string; task: WorkTask }> {
    return this.http.post<{ message: string; task: WorkTask }>(this.apiUrl, payload);
  }

  /** Admin: edit a task that hasn't been submitted yet. */
  updateTask(
    id: string,
    payload: { title?: string; description?: string; dueDate?: string | null },
  ): Observable<{ message: string; task: WorkTask }> {
    return this.http.put<{ message: string; task: WorkTask }>(`${this.apiUrl}/${id}`, payload);
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

  getTask(id: string): Observable<WorkTask> {
    return this.http.get<WorkTask>(`${this.apiUrl}/${id}`);
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
    return this.http.put<{ message: string; task: WorkTask }>(
      `${this.apiUrl}/${id}/submit`,
      form,
    );
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

  /** URL to view/download one evidence file (browser sends the auth header via interceptor
   *  only for XHR/fetch, not plain <a>/<img> navigation — components fetch it as a blob). */
  evidenceUrl(taskId: string, fileId: string): string {
    return `${this.apiUrl}/${taskId}/evidence/${fileId}`;
  }

  getEvidenceBlob(taskId: string, fileId: string): Observable<Blob> {
    return this.http.get(this.evidenceUrl(taskId, fileId), { responseType: 'blob' });
  }
}
