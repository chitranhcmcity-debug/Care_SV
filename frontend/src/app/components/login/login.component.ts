import { Component, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

// Local development accounts. Only fill the username; the password is entered manually.
const DEMO_ACCOUNTS = [
  {
    email: 'admin',
    label: 'Quản trị viên',
    initial: 'QT',
    tone: 'bg-blue-100 text-blue-600',
  },
  {
    email: 'staff',
    label: 'Nhân viên',
    initial: 'NV',
    tone: 'bg-emerald-100 text-emerald-600',
  },
  {
    email: 'teacher',
    label: 'Giảng viên',
    initial: 'GV',
    tone: 'bg-amber-100 text-amber-600',
  },
];

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  email = '';
  password = '';
  showPassword = false;
  loading = false;
  errorMessage = '';
  readonly quickAccounts = isDevMode() ? DEMO_ACCOUNTS : [];

  useQuickAccount(email: string, passwordInput: HTMLInputElement) {
    this.email = email;
    this.password = '';
    this.errorMessage = '';
    passwordInput.focus();
  }

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {
    if (this.authService.isLoggedIn()) {
      this.redirectByUserRole();
    }
  }

  onLogin() {
    if (!this.email || !this.password) {
      this.errorMessage = 'Vui lòng điền đầy đủ tài khoản và mật khẩu!';
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
        this.errorMessage =
          err.error?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin!';
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
