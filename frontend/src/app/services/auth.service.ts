import { API_BASE_URL } from '../config/api';
import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { User } from '../models/types';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiUrl = inject(API_BASE_URL) + '/auth';

  currentUser = signal<User | null>(this.getStoredUser());
  token = signal<string | null>(localStorage.getItem('itc_token'));

  private readonly http = inject(HttpClient);

  private getStoredUser(): User | null {
    const raw = localStorage.getItem('itc_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  login(credentials: {
    email: string;
    password: string;
  }): Observable<{ token: string; user: User }> {
    return this.http.post<{ token: string; user: User }>(`${this.apiUrl}/login`, credentials).pipe(
      tap((res) => {
        localStorage.setItem('itc_token', res.token);
        localStorage.setItem('itc_user', JSON.stringify(res.user));
        this.token.set(res.token);
        this.currentUser.set(res.user);
      }),
    );
  }

  /** Self sign-up (teachers and staff only); the account must be verified by email. */
  register(payload: {
    fullName: string;
    email: string;
    password: string;
    role: 'staff' | 'teacher';
  }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/register`, payload);
  }

  verifyEmail(token: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/verify-email`, { token });
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/forgot-password`, { email });
  }

  resetPassword(token: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/reset-password`, {
      token,
      password,
    });
  }

  logout(): void {
    localStorage.removeItem('itc_token');
    localStorage.removeItem('itc_user');
    this.token.set(null);
    this.currentUser.set(null);
  }

  isLoggedIn(): boolean {
    const token = this.token();
    if (!token || !this.currentUser()) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  isManager(): boolean {
    return this.currentUser()?.role === 'manager';
  }

  /** Admin or Trưởng phòng/Phó hiệu trưởng. */
  isManagement(): boolean {
    return this.isAdmin() || this.isManager();
  }

  isAdmin(): boolean {
    return this.currentUser()?.role === 'admin';
  }

  isStaff(): boolean {
    return this.currentUser()?.role === 'staff';
  }

  isTeacher(): boolean {
    return this.currentUser()?.role === 'teacher';
  }
}
