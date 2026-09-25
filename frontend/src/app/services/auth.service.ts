import { API_BASE_URL } from '../config/api';
import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { Permission, Role, User } from '../models/types';

/** Dashboard tabs a non-admin can be granted; holding any of them opens /management. */
export const DASHBOARD_PERMISSIONS: Permission[] = [
  'tasks.manage',
  'classes.assign',
  'warnings.configure',
  'reports.view',
  'courses.manage',
  'excel.import',
];

/** Who may open each signed-in page. Guards, the sidebar and the landing page all read this. */
const PAGE_ACCESS: Record<string, (auth: AuthService) => boolean> = {
  '/admin': (a) => a.isAdmin(),
  '/management': (a) => !a.isAdmin() && a.canAny(...DASHBOARD_PERMISSIONS),
  '/students': (a) => a.can('students.view'),
  '/attendance': (a) => a.canAny('attendance.take', 'attendance.override'),
  '/call-tasks': (a) => a.canAny('callTasks.update', 'callTasks.viewAll'),
  '/tasks': (a) => a.isStaff(),
  '/timetable': () => true,
  '/calls': () => true,
  '/billing': (a) => a.isAdmin(),
};
/** Preferred landing page per role; if it is not accessible, the first page that is. */
const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  manager: '/management',
  staff: '/call-tasks',
  teacher: '/attendance',
};

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiUrl = inject(API_BASE_URL) + '/auth';

  currentUser = signal<User | null>(this.readStored<User>('itc_user'));
  token = signal<string | null>(localStorage.getItem('itc_token'));
  /** null until known (e.g. a session from before permissions existed); see refreshSession. */
  permissions = signal<Permission[] | null>(this.readStored<Permission[]>('itc_permissions'));

  private readonly http = inject(HttpClient);

  private readStored<T>(key: string): T | null {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private storeSession(user: User, permissions: Permission[]) {
    localStorage.setItem('itc_user', JSON.stringify(user));
    localStorage.setItem('itc_permissions', JSON.stringify(permissions));
    this.currentUser.set(user);
    this.permissions.set(permissions);
  }

  login(credentials: {
    email: string;
    password: string;
  }): Observable<{ token: string; user: User; permissions: Permission[] }> {
    return this.http
      .post<{ token: string; user: User; permissions: Permission[] }>(
        `${this.apiUrl}/login`,
        credentials,
      )
      .pipe(
        tap((res) => {
          localStorage.setItem('itc_token', res.token);
          this.token.set(res.token);
          this.storeSession(res.user, res.permissions ?? []);
        }),
      );
  }

  /** Re-reads the user and permissions, picking up changes the admin made since sign-in.
   *  Emits whether the session is still valid. */
  refreshSession(): Observable<boolean> {
    if (!this.isLoggedIn()) return of(false);
    return this.http.get<{ user: User; permissions: Permission[] }>(`${this.apiUrl}/me`).pipe(
      tap((res) => this.storeSession(res.user, res.permissions)),
      map(() => true),
      catchError(() => of(this.isLoggedIn())),
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
    localStorage.removeItem('itc_permissions');
    this.token.set(null);
    this.currentUser.set(null);
    this.permissions.set(null);
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

  /** The admin holds every permission; other roles hold what the permission matrix grants. */
  /** Permissions come from the server: the admin holds a fixed, view-only set. */
  can(permission: Permission): boolean {
    return Boolean(this.permissions()?.includes(permission));
  }

  canAny(...permissions: Permission[]): boolean {
    return permissions.some((p) => this.can(p));
  }

  canOpen(path: string): boolean {
    return this.isLoggedIn() && Boolean(PAGE_ACCESS[path]?.(this));
  }

  /** Landing page after sign-in, or when a guard turns the user away. */
  homePath(): string {
    const role = this.currentUser()?.role;
    if (!role || !this.isLoggedIn()) return '/login';
    const preferred = ROLE_HOME[role];
    if (this.canOpen(preferred)) return preferred;
    return Object.keys(PAGE_ACCESS).find((path) => this.canOpen(path)) ?? '/timetable';
  }

  isManager(): boolean {
    return this.currentUser()?.role === 'manager';
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
