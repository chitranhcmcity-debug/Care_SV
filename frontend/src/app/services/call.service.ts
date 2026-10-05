import { API_BASE_URL } from '../config/api';
import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';

export type CallTarget = 'sinh_vien' | 'phu_huynh';
export type CallMethod = 'dien_thoai' | 'stringee';
export type CallOutcome = '' | 'nghe_may' | 'khong_nghe_may' | 'may_ban' | 'sai_so';

export const CALL_OUTCOME_LABELS: Record<Exclude<CallOutcome, ''>, string> = {
  nghe_may: 'Đã nghe máy',
  khong_nghe_may: 'Không nghe máy',
  may_ban: 'Máy bận',
  sai_so: 'Sai số / không liên lạc được',
};

/** Gọi ai; mở từ điểm danh, hồ sơ chăm sóc hoặc trang hồ sơ sinh viên. */
export interface CallRequest {
  student: {
    _id: string;
    fullName: string;
    studentCode?: string;
    phone?: string;
    parentPhone?: string;
  };
  target?: CallTarget;
  careCaseId?: string;
  courseGroupId?: string;
}

export interface CallLog {
  _id: string;
  callerId: { _id: string; fullName: string; email: string; role: string } | string;
  studentId: { _id: string; studentCode: string; fullName: string; classCode: string } | string;
  courseGroupId?: { groupCode: string; courseName: string } | null;
  target: CallTarget;
  phoneNumber: string;
  method: CallMethod;
  status: 'dang_goi' | 'ket_thuc';
  outcome: CallOutcome;
  note: string;
  startedAt: string;
  endedAt?: string | null;
  durationSec: number;
  stringeeCallId?: string;
  /** Người gọi đã chọn ghi âm cuộc gọi này. */
  record?: boolean;
  recording?: { mimeType: string; size: number; source: 'tai_len' | 'stringee' } | null;
  careCaseId?: { _id: string; status: string } | string | null;
  /** Người xem được phát bản ghi âm của cuộc gọi này (cuộc gọi của họ, hoặc recordings.viewAll). */
  canPlay?: boolean;
  createdAt: string;
}

export interface StartCallResponse {
  call: CallLog;
  phoneNumber: string;
  stringee: { accessToken: string; from: string; to: string } | null;
}

/** Gọi ngay trong ứng dụng: mọi cuộc gọi đều được ghi nhật ký, và có thể kèm ghi âm. */
@Injectable({ providedIn: 'root' })
export class CallService {
  private readonly apiUrl = inject(API_BASE_URL) + '/calls';
  private readonly http = inject(HttpClient);

  /** Cuộc gọi mà hộp thoại toàn cục đang hiển thị; null khi đóng. */
  readonly request = signal<CallRequest | null>(null);
  /** Tăng lên mỗi khi một cuộc gọi được lưu, để các danh sách lịch sử làm mới. */
  readonly savedVersion = signal(0);

  private config$?: Observable<{ stringee: boolean; hotline: string }>;

  open(request: CallRequest) {
    this.request.set(request);
  }

  close() {
    this.request.set(null);
  }

  config(): Observable<{ stringee: boolean; hotline: string }> {
    this.config$ ??= this.http
      .get<{ stringee: boolean; hotline: string }>(`${this.apiUrl}/config`)
      .pipe(shareReplay(1));
    return this.config$;
  }

  start(payload: {
    studentId: string;
    target: CallTarget;
    method: CallMethod;
    record: boolean;
    careCaseId?: string;
    courseGroupId?: string;
  }): Observable<StartCallResponse> {
    return this.http.post<StartCallResponse>(this.apiUrl, payload);
  }

  end(
    id: string,
    payload: { outcome: CallOutcome; note: string; durationSec?: number; stringeeCallId?: string },
  ): Observable<{ call: CallLog }> {
    return this.http.put<{ call: CallLog }>(`${this.apiUrl}/${id}/end`, payload);
  }

  uploadRecording(id: string, file: File): Observable<{ call: CallLog }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ call: CallLog }>(`${this.apiUrl}/${id}/recording`, form);
  }

  /** Bản ghi âm dạng Blob (phần tử audio không tự gửi được header xác thực của ta). */
  recording(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${id}/recording`, { responseType: 'blob' });
  }

  /** scope 'all' liệt kê cuộc gọi của mọi người (recordings.viewAll); nếu không thì của chính người dùng. */
  list(
    query: { studentId?: string; scope?: 'all'; page?: number; limit?: number } = {},
  ): Observable<{
    items: CallLog[];
    total: number;
    page: number;
    limit: number;
    canViewAll: boolean;
  }> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    return this.http.get<{
      items: CallLog[];
      total: number;
      page: number;
      limit: number;
      canViewAll: boolean;
    }>(this.apiUrl, { params });
  }
}
