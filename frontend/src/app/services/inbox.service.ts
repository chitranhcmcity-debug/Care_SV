import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Công việc đang chờ người dùng; `new` = xuất hiện từ lần họ mở chuông gần nhất. */
export interface InboxSummary {
  care: { pending: number; new: number };
  tasks: { pending: number; new: number };
  unseen: number;
}

/** Các loại công việc; mỗi loại được đánh dấu đã xem khi bấm chuông hoặc mở trang của nó. */
export type InboxScope = 'care' | 'tasks';

/** Chuông ở header (GET /api/notifications). */
@Injectable({ providedIn: 'root' })
export class InboxService {
  private readonly apiUrl = inject(API_BASE_URL) + '/notifications';
  private readonly http = inject(HttpClient);

  summary(): Observable<InboxSummary> {
    return this.http.get<InboxSummary>(this.apiUrl);
  }

  /** Đánh dấu công việc đã xem: một loại (trang của nó đã mở) hoặc, không có scope, tất cả (chuông). */
  markSeen(scope?: InboxScope): Observable<InboxSummary> {
    return this.http.put<InboxSummary>(`${this.apiUrl}/seen`, scope ? { scope } : {});
  }
}
