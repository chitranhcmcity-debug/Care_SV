import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { User } from '../models/types';

@Injectable({
  providedIn: 'root',
})
export class StaffService {
  private get apiUrl(): string {
    const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
    return `http://${host}:5000/api/auth`;
  }

  constructor(private http: HttpClient) {}

  getStaffList(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/staff-list`);
  }

  createStaff(payload: { fullName: string; email: string; customPassword?: string; role?: 'staff' | 'teacher' }): Observable<{ message: string; staff: User; generatedPassword?: string }> {
    return this.http.post<{ message: string; staff: User; generatedPassword?: string }>(`${this.apiUrl}/create-staff`, payload);
  }

  updateStaff(id: string, payload: { fullName?: string; email?: string; password?: string }): Observable<{ message: string; staff: User }> {
    return this.http.put<{ message: string; staff: User }>(`${this.apiUrl}/staff/${id}`, payload);
  }

  resetStaffPassword(id: string, newPassword?: string): Observable<{ message: string; newPassword: string }> {
    return this.http.post<{ message: string; newPassword: string }>(`${this.apiUrl}/staff/${id}/reset-password`, { newPassword });
  }

  toggleStaffStatus(id: string, status: 'active' | 'inactive'): Observable<{ message: string; staff: User }> {
    return this.http.put<{ message: string; staff: User }>(`${this.apiUrl}/staff/${id}/status`, { status });
  }

  deleteStaff(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/staff/${id}`);
  }

  getClassAssignments(): Observable<{ staffs: User[]; availableClasses: string[]; allStudents?: any[] }> {
    return this.http.get<{ staffs: User[]; availableClasses: string[]; allStudents?: any[] }>(`${this.apiUrl}/class-assignments`);
  }

  assignManagedClasses(staffId: string, managedClasses: string[]): Observable<{ message: string; staff: User }> {
    return this.http.put<{ message: string; staff: User }>(`${this.apiUrl}/staff/${staffId}/managed-classes`, { managedClasses });
  }

  assignManagedStudents(staffId: string, managedStudentIds: string[]): Observable<{ message: string; staff: User }> {
    return this.http.put<{ message: string; staff: User }>(`${this.apiUrl}/staff/${staffId}/managed-students`, { managedStudentIds });
  }

  transferClasses(payload: { fromStaffId: string; toStaffId: string; classCodes?: string[] }): Observable<{
    message: string;
    transferredClasses: string[];
    reassignedTaskCount: number;
  }> {
    return this.http.post<{ message: string; transferredClasses: string[]; reassignedTaskCount: number }>(
      `${this.apiUrl}/transfer-classes`,
      payload
    );
  }
}
