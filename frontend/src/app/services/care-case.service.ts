import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CareResult, CareSource, CareStatus, Role } from '../models/types';
import { CallLog } from './call.service';

type Person = { _id: string; fullName: string; email?: string; role?: Role };

export interface CareStep {
  _id: string;
  title: string;
  source: 'mac_dinh' | 'quan_ly' | 'nhan_vien' | 'ai';
  done: boolean;
  doneAt: string | null;
  note: string;
}

export type CareNoteKind = 'trao_doi' | 'kho_khan' | 'chi_dao' | 'su_kien' | 'cuoc_goi';

export interface CareNote {
  _id: string;
  kind: CareNoteKind;
  authorId: Person | null;
  text: string;
  callId?: string | null;
  createdAt: string;
}

export interface CareWarning {
  level: string;
  color: string;
  groupCode: string;
  absentPeriods: number;
  absentPercent: number | null;
}

/** Một dòng của danh sách hồ sơ. */
export interface CareCaseSummary {
  _id: string;
  studentId: { _id: string; studentCode: string; fullName: string; classCode: string };
  source: CareSource;
  reason: string;
  warning?: CareWarning;
  status: CareStatus;
  assignedStaffId: Person | null;
  proposedBy: Person | null;
  directive: string;
  dueDate: string | null;
  stepsDone: number;
  stepsTotal: number;
  closing?: CareClosing;
  createdAt: string;
  updatedAt: string;
}

export interface CareClosing {
  result: CareResult | '';
  summary: string;
  early: boolean;
  proposedBy: Person | null;
  proposedAt: string | null;
  approvedBy: Person | null;
  closedAt: string | null;
}

export interface CareCase extends Omit<CareCaseSummary, 'studentId' | 'stepsDone' | 'stepsTotal'> {
  studentId: {
    _id: string;
    studentCode: string;
    fullName: string;
    classCode: string;
    major?: string;
    phone?: string;
    parentPhone?: string;
    tags?: string[];
  };
  directedBy: Person | null;
  directedAt: string | null;
  cause: string;
  solution: string;
  steps: CareStep[];
  notes: CareNote[];
  closing: CareClosing;
  calls: (CallLog & { canPlay: boolean })[];
  permissions: { manage: boolean; work: boolean };
}

export interface CareStaffOption {
  _id: string;
  fullName: string;
  email: string;
  managedClasses: string[];
  openCases: number;
}

/** Hồ sơ chăm sóc sinh viên (/api/care-cases). */
@Injectable({ providedIn: 'root' })
export class CareCaseService {
  private readonly apiUrl = inject(API_BASE_URL) + '/care-cases';
  private readonly http = inject(HttpClient);

  /** status: 'open' | 'closed' | 'all' | một CareStatus. mine: chỉ hồ sơ được giao / do tôi đề xuất. */
  list(query: { status?: string; q?: string; mine?: boolean } = {}): Observable<{
    items: CareCaseSummary[];
  }> {
    let params = new HttpParams();
    if (query.status) params = params.set('status', query.status);
    if (query.q) params = params.set('q', query.q);
    if (query.mine) params = params.set('mine', '1');
    return this.http.get<{ items: CareCaseSummary[] }>(this.apiUrl, { params });
  }

  summary(): Observable<{ counts: Record<CareStatus, number>; open: number }> {
    return this.http.get<{ counts: Record<CareStatus, number>; open: number }>(
      `${this.apiUrl}/summary`,
    );
  }

  staff(): Observable<CareStaffOption[]> {
    return this.http.get<CareStaffOption[]>(`${this.apiUrl}/staff`);
  }

  forStudent(studentId: string): Observable<CareCaseSummary[]> {
    return this.http.get<CareCaseSummary[]>(`${this.apiUrl}/student/${studentId}`);
  }

  get(id: string): Observable<CareCase> {
    return this.http.get<CareCase>(`${this.apiUrl}/${id}`);
  }

  /** Đề xuất chăm sóc (hoặc, với quản lý nêu tên nhân viên, mở ở dạng có chỉ đạo). */
  create(payload: {
    studentId: string;
    reason: string;
    assignedStaffId?: string;
    directive?: string;
    dueDate?: string | null;
    fromTask?: boolean;
  }): Observable<CareCase> {
    return this.http.post<CareCase>(this.apiUrl, payload);
  }

  direct(
    id: string,
    payload: { assignedStaffId: string; directive?: string; dueDate?: string | null },
  ): Observable<CareCase> {
    return this.http.put<CareCase>(`${this.apiUrl}/${id}/direct`, payload);
  }

  addStep(id: string, title: string, source?: 'ai'): Observable<CareCase> {
    return this.http.post<CareCase>(`${this.apiUrl}/${id}/steps`, { title, source });
  }

  updateStep(
    id: string,
    stepId: string,
    payload: { done?: boolean; note?: string; title?: string },
  ): Observable<CareCase> {
    return this.http.put<CareCase>(`${this.apiUrl}/${id}/steps/${stepId}`, payload);
  }

  removeStep(id: string, stepId: string): Observable<CareCase> {
    return this.http.delete<CareCase>(`${this.apiUrl}/${id}/steps/${stepId}`);
  }

  findings(id: string, payload: { cause?: string; solution?: string }): Observable<CareCase> {
    return this.http.put<CareCase>(`${this.apiUrl}/${id}/findings`, payload);
  }

  note(id: string, kind: 'trao_doi' | 'kho_khan' | 'chi_dao', text: string): Observable<CareCase> {
    return this.http.post<CareCase>(`${this.apiUrl}/${id}/notes`, { kind, text });
  }

  aiSteps(id: string): Observable<{ steps: string[] }> {
    return this.http.post<{ steps: string[] }>(`${this.apiUrl}/${id}/ai-steps`, {});
  }

  requestClose(
    id: string,
    payload: { result: CareResult; summary: string; early: boolean },
  ): Observable<CareCase> {
    return this.http.post<CareCase>(`${this.apiUrl}/${id}/close-request`, payload);
  }

  /** approve true/false trả lời một đề nghị đóng; có result + summary thì quản lý đóng trực tiếp. */
  close(
    id: string,
    payload: {
      approve?: boolean;
      note?: string;
      result?: CareResult;
      summary?: string;
      early?: boolean;
    },
  ): Observable<CareCase> {
    return this.http.post<CareCase>(`${this.apiUrl}/${id}/close`, payload);
  }
}
