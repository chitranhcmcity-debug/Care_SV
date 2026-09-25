import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ClassAssignmentOverview, ClassAssignmentRecord } from '../models/types';

/** Phân lớp hành chính cho nhân viên CSKH (Trưởng phòng), có lịch sử phân công. */
@Injectable({
  providedIn: 'root',
})
export class ClassAssignmentService {
  private readonly apiUrl = inject(API_BASE_URL) + '/class-assignments';

  private readonly http = inject(HttpClient);

  getOverview(): Observable<ClassAssignmentOverview> {
    return this.http.get<ClassAssignmentOverview>(this.apiUrl);
  }

  getHistory(
    filter: { classCode?: string; staffId?: string } = {},
  ): Observable<ClassAssignmentRecord[]> {
    const params: Record<string, string> = {};
    if (filter.classCode) params['classCode'] = filter.classCode;
    if (filter.staffId) params['staffId'] = filter.staffId;
    return this.http.get<ClassAssignmentRecord[]>(`${this.apiUrl}/history`, { params });
  }

  /** staffId null = thu hồi (open calls of the class go to the manager queue). */
  assign(classCode: string, staffId: string | null): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.apiUrl}/${encodeURIComponent(classCode)}`, {
      staffId,
    });
  }

  transfer(payload: {
    fromStaffId: string;
    toStaffId: string;
    classCodes?: string[];
  }): Observable<{ message: string; transferredClasses: string[]; reassignedTaskCount: number }> {
    return this.http.post<{
      message: string;
      transferredClasses: string[];
      reassignedTaskCount: number;
    }>(`${this.apiUrl}/transfer`, payload);
  }
}
