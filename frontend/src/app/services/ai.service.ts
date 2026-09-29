import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { StaffProgressRow } from '../models/types';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** What AI Care helps the signed-in user with (depends on role and permissions). */
export interface AiCareProfile {
  name: string;
  role: string;
  roleLabel: string;
  focus: string;
  capabilities: string[];
  suggestions: string[];
}

/** An operation AI Care prepared on the user's behalf; it only runs once they confirm it. */
export interface AiCareAction {
  id: string;
  title: string;
  details: string[];
}

export interface AiCareReply {
  reply: string;
  actions?: AiCareAction[];
  navigate?: string | null;
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

  /** AI Care: hồ sơ trợ lý theo vai trò (năng lực + câu hỏi gợi ý). */
  getCareProfile(): Observable<AiCareProfile> {
    return this.http.get<AiCareProfile>(`${this.apiUrl}/care`);
  }

  /**
   * AI Care: hỏi đáp theo vai trò; client gửi lại toàn bộ hội thoại mỗi lượt. `actions` are
   * operations AI Care prepared (nothing changed yet — the user confirms each one), `navigate`
   * a page it asked to open.
   */
  careChat(messages: ChatMessage[]): Observable<AiCareReply> {
    return this.http.post<AiCareReply>(`${this.apiUrl}/care`, { messages });
  }

  /** Runs an action AI Care prepared, after the user pressed Xác nhận. */
  confirmCareAction(id: string): Observable<{ message: string; navigate?: string }> {
    return this.http.post<{ message: string; navigate?: string }>(
      `${this.apiUrl}/care/actions/${encodeURIComponent(id)}/confirm`,
      {},
    );
  }

  cancelCareAction(id: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(
      `${this.apiUrl}/care/actions/${encodeURIComponent(id)}/cancel`,
      {},
    );
  }

  /** Đánh giá năng lực 1 nhân viên: tiến độ, đúng hạn, chất lượng công việc và chăm sóc SV. */
  getStaffPerformance(
    staffId: string,
    period: { from?: string; to?: string } = {},
  ): Observable<{ assessment: string; metrics: StaffProgressRow }> {
    return this.http.post<{ assessment: string; metrics: StaffProgressRow }>(
      `${this.apiUrl}/staff-performance`,
      { staffId, from: period.from || undefined, to: period.to || undefined },
    );
  }
}
