import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { StaffProgressRow } from '../models/types';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiCareChatMessage extends ChatMessage {
  image?: { dataUrl: string };
}

/** AI Care giúp gì cho người dùng đang đăng nhập (tùy vai trò và quyền). */
export interface AiCareProfile {
  name: string;
  role: string;
  roleLabel: string;
  focus: string;
  capabilities: string[];
  suggestions: string[];
}

/** Một thao tác AI Care chuẩn bị thay mặt người dùng; nó chỉ chạy khi họ xác nhận. */
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

  /** Gợi ý lời khuyên khi gọi điện cho sinh viên của một hồ sơ chăm sóc. */
  getCallAdvice(careCaseId: string): Observable<{ advice: string }> {
    return this.http.post<{ advice: string }>(`${this.apiUrl}/call-advice`, { careCaseId });
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
   * AI Care: hỏi đáp theo vai trò; client gửi lại toàn bộ hội thoại mỗi lượt. `actions` là
   * các thao tác AI Care đã chuẩn bị (chưa thay đổi gì — người dùng xác nhận từng cái), `navigate`
   * một trang nó yêu cầu mở.
   */
  careChat(messages: AiCareChatMessage[]): Observable<AiCareReply> {
    return this.http.post<AiCareReply>(`${this.apiUrl}/care`, { messages });
  }

  /** Chạy một thao tác AI Care đã chuẩn bị, sau khi người dùng bấm Xác nhận. */
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
