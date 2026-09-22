import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable({
  providedIn: 'root',
})
export class AiService {
  private readonly apiUrl = inject(API_BASE_URL) + '/ai';

  private readonly http = inject(HttpClient);

  /** Gợi ý lời khuyên khi gọi điện cho sinh viên của 1 nhiệm vụ gọi điện cụ thể. */
  getCallAdvice(callTaskId: string): Observable<{ advice: string }> {
    return this.http.post<{ advice: string }>(`${this.apiUrl}/call-advice`, { callTaskId });
  }

  /** Tóm tắt + nhận xét nhanh minh chứng của 1 nhiệm vụ nội bộ (Giao Việc). */
  reviewTaskEvidence(taskId: string): Observable<{ analysis: string }> {
    return this.http.post<{ analysis: string }>(`${this.apiUrl}/review-task-evidence`, {
      taskId,
    });
  }

  /** Trợ lý chat hỏi-đáp chung dựa trên số liệu hệ thống (Admin). */
  chat(messages: ChatMessage[]): Observable<{ reply: string }> {
    return this.http.post<{ reply: string }>(`${this.apiUrl}/chat`, { messages });
  }

  /** Đánh giá năng lực 1 nhân viên CSKH dựa trên lịch sử xử lý. */
  getStaffPerformance(
    staffId: string,
  ): Observable<{ assessment: string; stats: Record<string, unknown> }> {
    return this.http.post<{ assessment: string; stats: Record<string, unknown> }>(
      `${this.apiUrl}/staff-performance`,
      { staffId },
    );
  }
}
