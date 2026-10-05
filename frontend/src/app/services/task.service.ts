import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  WorkTask,
  TaskStatus,
  TaskCategory,
  TaskPriority,
  StaffProgressRow,
} from '../models/types';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root',
})
export class TaskService {
  private readonly apiUrl = inject(API_BASE_URL) + '/tasks';

  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotificationService);

  /** Admin: giao nhiệm vụ mới cho một nhân viên. */
  createTask(payload: {
    title: string;
    description: string;
    assignedTo: string;
    dueDate?: string | null;
    category?: TaskCategory;
    priority?: TaskPriority;
  }): Observable<{ message: string; task: WorkTask }> {
    return this.http.post<{ message: string; task: WorkTask }>(this.apiUrl, payload);
  }

  /** Quản lý: tiến độ & KPI của mọi nhân viên trên các nhiệm vụ tạo trong [from, to]. */
  getStaffProgress(period: {
    from?: string;
    to?: string;
  }): Observable<{ from: string | null; to: string | null; staff: StaffProgressRow[] }> {
    let params = new HttpParams();
    if (period.from) params = params.set('from', period.from);
    if (period.to) params = params.set('to', period.to);
    return this.http.get<{ from: string | null; to: string | null; staff: StaffProgressRow[] }>(
      `${this.apiUrl}/staff-progress`,
      { params },
    );
  }

  /** Nhân viên: báo đã làm tới đâu (0–99%; nộp minh chứng thì hoàn thành). */
  updateProgress(
    id: string,
    percent: number,
    note?: string,
  ): Observable<{ message: string; task: WorkTask }> {
    return this.http.put<{ message: string; task: WorkTask }>(`${this.apiUrl}/${id}/progress`, {
      percent,
      note,
    });
  }

  /** Admin: hủy/xóa một nhiệm vụ. */
  deleteTask(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  /** Admin: mọi nhiệm vụ trong hệ thống, có thể lọc. */
  getAllTasks(filters?: { status?: TaskStatus; assignedTo?: string }): Observable<WorkTask[]> {
    let params = new HttpParams();
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.assignedTo) params = params.set('assignedTo', filters.assignedTo);
    return this.http.get<WorkTask[]>(`${this.apiUrl}/admin-all`, { params });
  }

  /** Nhân viên: các nhiệm vụ giao cho tôi. */
  getMyTasks(status?: TaskStatus): Observable<WorkTask[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<WorkTask[]>(`${this.apiUrl}/my-tasks`, { params });
  }

  /** Nhân viên: số huy hiệu các nhiệm vụ cần xử lý (mới hoặc bị từ chối). */
  getPendingCount(): Observable<{ pendingCount: number }> {
    return this.http.get<{ pendingCount: number }>(`${this.apiUrl}/pending-count`);
  }

  /** Nhân viên: xác nhận đã nhận nhiệm vụ mới giao. */
  acknowledgeTask(id: string): Observable<{ message: string; task: WorkTask }> {
    return this.http.put<{ message: string; task: WorkTask }>(
      `${this.apiUrl}/${id}/acknowledge`,
      {},
    );
  }

  /** Nhân viên: nộp minh chứng hoàn thành — kết hợp tùy ý ghi chú, link và file. */
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

  /** Admin: duyệt (đóng) hoặc từ chối (trả lại) một nhiệm vụ đã nộp. */
  reviewTask(
    id: string,
    approve: boolean,
    reviewNote?: string,
    score?: number | null,
  ): Observable<{ message: string; task: WorkTask }> {
    return this.http.put<{ message: string; task: WorkTask }>(`${this.apiUrl}/${id}/review`, {
      approve,
      reviewNote,
      score: approve ? (score ?? null) : undefined,
    });
  }

  /** Mở một file minh chứng trong tab mới. Nó được tải dạng blob vì header xác thực
   *  chỉ được interceptor thêm cho XHR/fetch, không cho điều hướng <a>/<img> thường. */
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
