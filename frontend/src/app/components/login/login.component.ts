import { ChangeDetectorRef, Component, OnInit, isDevMode, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, Observable } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { BrandingService } from '../../services/branding.service';

// Local development accounts. Only fill the username; the password is entered manually.
const DEMO_ACCOUNTS = [
  {
    email: 'admin',
    label: 'Quản trị viên',
    initial: 'QT',
    tone: 'bg-blue-100 text-blue-600',
  },
  {
    email: 'manager',
    label: 'Trưởng phòng / Phó hiệu trưởng',
    initial: 'QL',
    tone: 'bg-violet-100 text-violet-600',
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

/** Which auth screen this route shows; set through the route's `data.mode`. */
export type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'verify';

const MIN_PASSWORD_LENGTH = 8;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  protected readonly branding = inject(BrandingService);

  mode: AuthMode = 'login';
  readonly minPasswordLength = MIN_PASSWORD_LENGTH;

  email = '';
  password = '';
  confirmPassword = '';
  fullName = '';
  role: 'staff' | 'teacher' = 'teacher';
  showPassword = false;
  loading = false;
  errorMessage = '';
  successMessage = '';
  /** Reset / verify screen opened without a token in the URL. */
  linkMissing = false;
  /** One-time token from the email link (reset / verify screens). */
  private token = '';
  readonly quickAccounts = isDevMode() ? DEMO_ACCOUNTS : [];

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.mode = (this.route.snapshot.data['mode'] as AuthMode) || 'login';
    this.token = this.route.snapshot.queryParamMap.get('token') || '';

    if (this.mode === 'login' && this.authService.isLoggedIn()) {
      this.redirectByUserRole();
      return;
    }
    if ((this.mode === 'reset' || this.mode === 'verify') && !this.token) {
      this.linkMissing = true;
      this.errorMessage =
        'Liên kết không hợp lệ hoặc thiếu mã xác thực. Hãy mở lại liên kết trong email.';
      return;
    }
    if (this.mode === 'verify') {
      this.run(this.authService.verifyEmail(this.token), (message) => {
        this.successMessage = message;
      });
    }
  }

  useQuickAccount(email: string) {
    this.email = email;
    this.password = '';
    this.errorMessage = '';
    document.getElementById('login-password')?.focus();
  }

  onLogin() {
    if (!this.email || !this.password) {
      this.errorMessage = 'Vui lòng điền đầy đủ tài khoản và mật khẩu!';
      return;
    }
    this.run(this.authService.login({ email: this.email, password: this.password }), () =>
      this.redirectByUserRole(),
    );
  }

  onRegister() {
    if (!this.fullName.trim() || !this.email.trim()) {
      this.errorMessage = 'Vui lòng nhập họ tên và email.';
      return;
    }
    if (!this.checkNewPassword()) return;
    this.run(
      this.authService.register({
        fullName: this.fullName.trim(),
        email: this.email.trim(),
        password: this.password,
        role: this.role,
      }),
      (message) => {
        this.successMessage = message;
        this.password = this.confirmPassword = '';
      },
    );
  }

  onForgot() {
    if (!this.email.trim()) {
      this.errorMessage = 'Vui lòng nhập email đã đăng ký.';
      return;
    }
    this.run(this.authService.forgotPassword(this.email.trim()), (message) => {
      this.successMessage = message;
    });
  }

  onReset() {
    if (!this.checkNewPassword()) return;
    this.run(this.authService.resetPassword(this.token, this.password), (message) => {
      this.successMessage = message;
      this.password = this.confirmPassword = '';
    });
  }

  private checkNewPassword(): boolean {
    if (this.password.length < MIN_PASSWORD_LENGTH) {
      this.errorMessage = `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
      return false;
    }
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Mật khẩu nhập lại không khớp.';
      return false;
    }
    return true;
  }

  /** Runs a request with the shared loading / error / success handling. */
  private run<T>(request: Observable<T>, onSuccess: (message: string, result: T) => void) {
    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    // The app is zoneless: async results only reach the screen after markForCheck().
    request
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (result) => onSuccess((result as { message?: string }).message || '', result),
        error: (err) => {
          this.errorMessage =
            err.status === 0
              ? 'Không kết nối được máy chủ. Vui lòng thử lại.'
              : err.status === 404
                ? 'Máy chủ chưa có chức năng này. Hãy khởi động lại backend rồi thử lại.'
                : err.error?.message || 'Có lỗi xảy ra. Vui lòng thử lại!';
        },
      });
  }

  private redirectByUserRole() {
    this.router.navigate([this.authService.homePath()]);
  }
}
