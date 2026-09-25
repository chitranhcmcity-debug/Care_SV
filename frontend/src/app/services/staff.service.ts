import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { User } from '../models/types';

@Injectable({
  providedIn: 'root',
})
export class StaffService {
  private readonly apiUrl = inject(API_BASE_URL) + '/auth';

  private readonly http = inject(HttpClient);

  getStaffList(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/staff-list`);
  }

  createStaff(payload: {
    fullName: string;
    email: string;
    customPassword?: string;
    role?: 'staff' | 'teacher' | 'manager';
  }): Observable<{
    message: string;
    staff: User;
    generatedPassword?: string;
    emailSent: boolean;
  }> {
    return this.http.post<{
      message: string;
      staff: User;
      generatedPassword?: string;
      emailSent: boolean;
    }>(`${this.apiUrl}/create-staff`, payload);
  }

  updateStaff(
    id: string,
    payload: { fullName?: string; email?: string; password?: string },
  ): Observable<{ message: string; staff: User }> {
    return this.http.put<{ message: string; staff: User }>(`${this.apiUrl}/staff/${id}`, payload);
  }

  resetStaffPassword(
    id: string,
    newPassword?: string,
  ): Observable<{ message: string; newPassword: string; emailSent: boolean }> {
    return this.http.post<{ message: string; newPassword: string; emailSent: boolean }>(
      `${this.apiUrl}/staff/${id}/reset-password`,
      { newPassword },
    );
  }

  toggleStaffStatus(
    id: string,
    status: 'active' | 'inactive',
  ): Observable<{ message: string; staff: User }> {
    return this.http.put<{ message: string; staff: User }>(`${this.apiUrl}/staff/${id}/status`, {
      status,
    });
  }

  deleteStaff(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/staff/${id}`);
  }

  // Class assignment moved to ClassAssignmentService (/api/class-assignments).
}
