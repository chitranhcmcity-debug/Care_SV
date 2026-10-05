import { API_BASE_URL } from '../config/api';
import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { Permission, Role, User } from '../models/types';
import type { SubscriptionPlan } from './billing.service';

export interface AccountRenewal {
  fullName: string;
  email: string; // đã che
  status: 'active' | 'awaiting_payment';
  accessExpiresAt: string | null;
}

export interface AccountPaymentResult {
  status: 'cho_thanh_toan' | 'da_thanh_toan' | 'da_huy' | 'het_han';
  planName: string;
  months: number;
  amount: number;
  email: string; // đã che
  accessExpiresAt: string | null;
}

export interface Registration {
  _id: string;
  fullName: string;
  email: string;
  role: 'staff' | 'teacher';
  status: 'pending' | 'awaiting_key';
  approvedBy?: { fullName: string } | null;
  keyExpiresAt?: string | null;
  createdAt: string;
}

/** Các tab bảng điều khiển có thể cấp cho người không phải admin; giữ bất kỳ tab nào sẽ mở /management. */
export const DASHBOARD_PERMISSIONS: Permission[] = [
  'tasks.manage',
  'classes.assign',
  'warnings.configure',
  'reports.view',
  'courses.manage',
  'excel.import',
];

/** Ai được mở từng trang đã đăng nhập. Guard, sidebar và trang đầu đều đọc cái này. */
const PAGE_ACCESS: Record<string, (auth: AuthService) => boolean> = {
  '/admin': (a) => a.isAdmin(),
  '/management': (a) => !a.isAdmin() && a.canAny(...DASHBOARD_PERMISSIONS),
  '/students': (a) => a.can('students.view'),
  '/attendance': (a) => a.canAny('attendance.take', 'attendance.view'),
  '/care': (a) => a.canAny('care.work', 'care.manage', 'care.propose'),
  '/tasks': (a) => a.isStaff(),
  '/timetable': () => true,
  '/calls': () => true,
  '/billing': (a) => a.isAdmin() || a.isManager(),
  '/account-approvals': (a) => a.isManager(),
};
/** Trang đầu ưa thích theo vai trò; nếu không truy cập được thì trang đầu tiên truy cập được. */
const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  manager: '/management',
  staff: '/care',
  teacher: '/attendance',
};

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiUrl = inject(API_BASE_URL) + '/auth';

  currentUser = signal<User | null>(this.readStored<User>('itc_user'));
  token = signal<string | null>(localStorage.getItem('itc_token'));
  /** null cho đến khi biết (vd phiên từ trước khi có quyền); xem refreshSession. */
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

  /** activationKey: bắt buộc một lần, ở lần đăng nhập đầu tiên sau khi quản lý duyệt đăng ký. */
  login(credentials: {
    email: string;
    password: string;
    activationKey?: string;
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

  /** Đọc lại người dùng và quyền, nhận các thay đổi admin thực hiện từ khi đăng nhập.
   *  Phát ra việc phiên còn hợp lệ hay không. */
  refreshSession(): Observable<boolean> {
    if (!this.isLoggedIn()) return of(false);
    return this.http.get<{ user: User; permissions: Permission[] }>(`${this.apiUrl}/me`).pipe(
      tap((res) => this.storeSession(res.user, res.permissions)),
      map(() => true),
      catchError(() => of(this.isLoggedIn())),
    );
  }

  /** Tự đăng ký. Giảng viên và nhân viên chờ Trưởng phòng / PHT duyệt; Trưởng
   *  phòng / PHT chọn một gói và nhận link thanh toán PayOS để trả tiền trước khi tài khoản hoạt động. */
  register(payload: {
    fullName: string;
    email: string;
    password: string;
    role: 'staff' | 'teacher' | 'manager';
    planCode?: string;
    /** Giảng viên và nhân viên: Trưởng phòng / PHT có đơn vị mà họ vào và là người duyệt họ. */
    managerEmail?: string;
    /** SĐT phụ huynh có thể gọi lại (phụ huynh có thể gọi lại số này). */
    phone?: string;
  }): Observable<{ message: string; checkoutUrl?: string }> {
    return this.http.post<{ message: string; checkoutUrl?: string }>(
      `${this.apiUrl}/register`,
      payload,
    );
  }

  /** Bảng giá gói riêng của tài khoản Trưởng phòng / PHT (công khai). */
  getAccountPlans(): Observable<{ plans: SubscriptionPlan[]; payosConfigured: boolean }> {
    return this.http.get<{ plans: SubscriptionPlan[]; payosConfigured: boolean }>(
      `${this.apiUrl}/account-plans`,
    );
  }

  /** Link gia hạn thuộc về ai. */
  getAccountRenewal(token: string): Observable<AccountRenewal> {
    return this.http.get<AccountRenewal>(`${this.apiUrl}/account-renewal`, {
      params: { token },
    });
  }

  /** Mở thanh toán PayOS cho một link gia hạn. */
  createAccountOrder(
    token: string,
    planCode: string,
  ): Observable<{ orderCode: number; checkoutUrl: string }> {
    return this.http.post<{ orderCode: number; checkoutUrl: string }>(
      `${this.apiUrl}/account-orders`,
      { token, planCode },
    );
  }

  /** Hỏi máy chủ (và qua đó PayOS) xem một khoản thanh toán tài khoản đã thành công chưa. */
  syncAccountOrder(orderCode: string): Observable<AccountPaymentResult> {
    return this.http.post<AccountPaymentResult>(
      `${this.apiUrl}/account-orders/${encodeURIComponent(orderCode)}/sync`,
      {},
    );
  }

  /** Trưởng phòng / PHT: các đăng ký đang chờ duyệt hoặc chờ key kích hoạt. */
  getRegistrations(): Observable<Registration[]> {
    return this.http.get<Registration[]>(`${this.apiUrl}/registrations`);
  }

  approveRegistration(
    id: string,
  ): Observable<{ message: string; emailSent: boolean; activationKey?: string }> {
    return this.http.post<{ message: string; emailSent: boolean; activationKey?: string }>(
      `${this.apiUrl}/registrations/${id}/approve`,
      {},
    );
  }

  rejectRegistration(id: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/registrations/${id}/reject`, {});
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

  /** Admin giữ mọi quyền; các vai trò khác giữ những gì ma trận phân quyền cấp. */
  /** Quyền đến từ máy chủ: admin giữ bộ cố định chỉ xem. */
  can(permission: Permission): boolean {
    return Boolean(this.permissions()?.includes(permission));
  }

  canAny(...permissions: Permission[]): boolean {
    return permissions.some((p) => this.can(p));
  }

  canOpen(path: string): boolean {
    return this.isLoggedIn() && Boolean(PAGE_ACCESS[path]?.(this));
  }

  /** Trang đầu sau khi đăng nhập, hoặc khi guard từ chối người dùng. */
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
