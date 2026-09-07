import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-[85vh] flex items-center justify-center p-4 bg-slate-50">
      <div class="bg-white border border-slate-200 max-w-md w-full p-6 md:p-8 rounded-md shadow-sm space-y-6">
        <!-- Header -->
        <div class="text-center space-y-2">
          <div class="w-14 h-14 rounded-md bg-slate-800 mx-auto flex items-center justify-center text-white text-xl font-bold shadow-sm">
            ITC
          </div>
          <h2 class="text-xl font-bold text-slate-900 tracking-tight uppercase">ITC CARE ENTERPRISE</h2>
          <p class="text-xs font-medium text-slate-600">Hệ Thống Quản Lý & Phân Quyền Văn Phòng</p>
        </div>

        <!-- Error Alert -->
        <div *ngIf="errorMessage" class="p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-center gap-2">
          <span>⚠️</span> {{ errorMessage }}
        </div>

        <!-- Quick Demo Switcher -->
        <div class="space-y-1.5">
          <label class="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">Đăng nhập nhanh 3 Roles:</label>
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              (click)="fillCredentials('admin@itc.edu.vn', 'admin123')"
              class="py-2 px-2 rounded-md border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-all text-center"
            >
              🛡️ Admin
            </button>
            <button
              type="button"
              (click)="fillCredentials('teacher1@itc.edu.vn', 'teacher123')"
              class="py-2 px-2 rounded-md border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-all text-center"
            >
              👨‍🏫 Giảng viên
            </button>
            <button
              type="button"
              (click)="fillCredentials('staff1@itc.edu.vn', 'staff123')"
              class="py-2 px-2 rounded-md border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-all text-center"
            >
              🎧 CSKH Staff
            </button>
          </div>
        </div>

        <!-- Form -->
        <form (ngSubmit)="onLogin()" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">Email làm việc</label>
            <input
              type="email"
              [(ngModel)]="email"
              name="email"
              required
              placeholder="example@itc.edu.vn"
              class="w-full px-3 py-2.5 rounded-md border border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:border-slate-800 bg-white text-slate-900 text-sm transition-all"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">Mật khẩu</label>
            <input
              type="password"
              [(ngModel)]="password"
              name="password"
              required
              placeholder="••••••••"
              class="w-full px-3 py-2.5 rounded-md border border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:border-slate-800 bg-white text-slate-900 text-sm transition-all"
            />
          </div>

          <button
            type="submit"
            [disabled]="loading"
            class="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-md text-sm transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <span *ngIf="loading">⏳</span>
            <span>{{ loading ? 'Đang xác thực...' : 'ĐĂNG NHẬP HỆ THỐNG' }}</span>
          </button>
        </form>

        <div class="text-center text-[11px] font-medium text-slate-500 pt-3 border-t border-slate-200">
          Trường Cao Đẳng Công Nghệ Thông Tin TP.HCM (ITC) &copy; 2026
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  email = '';
  password = '';
  loading = false;
  errorMessage = '';

  constructor(private authService: AuthService, private router: Router) {
    if (this.authService.isLoggedIn()) {
      this.redirectByUserRole();
    }
  }

  fillCredentials(e: string, p: string) {
    this.email = e;
    this.password = p;
  }

  onLogin() {
    if (!this.email || !this.password) {
      this.errorMessage = 'Vui lòng điền đầy đủ Email và Mật khẩu!';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.authService.login({ email: this.email, password: this.password }).subscribe({
      next: () => {
        this.loading = false;
        this.redirectByUserRole();
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.error?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin!';
      },
    });
  }

  private redirectByUserRole() {
    if (this.authService.isAdmin()) {
      this.router.navigate(['/admin']);
    } else if (this.authService.isTeacher()) {
      this.router.navigate(['/attendance']);
    } else if (this.authService.isStaff()) {
      this.router.navigate(['/call-tasks']);
    } else {
      this.router.navigate(['/attendance']);
    }
  }
}
