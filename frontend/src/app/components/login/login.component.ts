import { ChangeDetectorRef, Component, OnInit, isDevMode, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, Observable } from 'rxjs';
import { AccountPaymentResult, AccountRenewal, AuthService } from '../../services/auth.service';
import type { SubscriptionPlan } from '../../services/billing.service';
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
export type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'renew' | 'payment';

const MIN_PASSWORD_LENGTH = 8;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit {
  protected readonly branding = inject(BrandingService);

  mode: AuthMode = 'login';
  readonly minPasswordLength = MIN_PASSWORD_LENGTH;

  email = '';
  password = '';
  confirmPassword = '';
  fullName = '';
  role: 'staff' | 'teacher' | 'manager' = 'teacher';
  /** Plans a Trưởng phòng / PHT buys for their own account (register and renew screens). */
  plans: SubscriptionPlan[] | null = null;
  planCode = '';
  payosConfigured = true;
  /** Payment / renewal page for an unpaid or expired Trưởng phòng / PHT account (from login). */
  renewUrl = '';
  /** Renew screen: whose account the emailed link renews. */
  renewal: AccountRenewal | null = null;
  /** Payment result screen (PayOS return page). */
  payment: AccountPaymentResult | null = null;
  showPassword = false;
  /** Set once the server says this approved account still needs its emailed activation key. */
  needsKey = false;
  activationKey = '';
  loading = false;
  errorMessage = '';
  successMessage = '';
  /** Reset screen opened without a token in the URL. */
  linkMissing = false;
  /** One-time token from the email link (reset screen). */
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
    if (this.mode === 'login' && this.route.snapshot.queryParamMap.get('expired')) {
      this.successMessage =
        'Gói dịch vụ của tài khoản đã hết hạn. Đăng nhập để nhận liên kết gia hạn.';
    }
    if (this.mode === 'renew') this.loadRenewal();
    if (this.mode === 'payment') this.checkPayment();
    if (this.mode === 'reset' && !this.token) {
      this.linkMissing = true;
      this.errorMessage =
        'Liên kết không hợp lệ hoặc thiếu mã xác thực. Hãy mở lại liên kết trong email.';
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
    if (this.needsKey && !this.activationKey.trim()) {
      this.errorMessage = 'Vui lòng nhập key kích hoạt đã gửi vào email của bạn.';
      return;
    }
    const credentials = { email: this.email, password: this.password };
    this.run(
      this.authService.login(
        this.needsKey ? { ...credentials, activationKey: this.activationKey.trim() } : credentials,
      ),
      () => this.redirectByUserRole(),
      (err) => {
        const code = err.error?.code;
        if (code === 'PAYMENT_REQUIRED' || code === 'ACCOUNT_EXPIRED') {
          this.renewUrl = err.error?.renewUrl ?? '';
          return;
        }
        if (code !== 'ACTIVATION_KEY_REQUIRED' && code !== 'ACTIVATION_KEY_INVALID') return;
        this.needsKey = true;
        // First ask is guidance, not an error.
        if (code === 'ACTIVATION_KEY_REQUIRED') {
          this.errorMessage = '';
          this.successMessage = err.error?.message ?? '';
        }
        setTimeout(() => document.getElementById('login-key')?.focus());
      },
    );
  }

  onRegister() {
    if (!this.fullName.trim() || !this.email.trim()) {
      this.errorMessage = 'Vui lòng nhập họ tên và email.';
      return;
    }
    if (this.role === 'manager' && !this.planCode) {
      this.errorMessage = 'Vui lòng chọn gói dịch vụ.';
      return;
    }
    if (!this.checkNewPassword()) return;
    this.run(
      this.authService.register({
        fullName: this.fullName.trim(),
        email: this.email.trim(),
        password: this.password,
        role: this.role,
        ...(this.role === 'manager' ? { planCode: this.planCode } : {}),
      }),
      (message, result) => {
        // Trưởng phòng / PHT: on to PayOS; the account works once the payment is confirmed.
        if (result.checkoutUrl) {
          window.location.href = result.checkoutUrl;
          return;
        }
        this.successMessage = message;
        this.password = this.confirmPassword = '';
      },
    );
  }

  /** Register screen: picking Trưởng phòng / PHT loads the plans to buy. */
  selectRole(role: 'staff' | 'teacher' | 'manager') {
    this.role = role;
    if (role === 'manager') this.loadPlans();
  }

  private loadPlans() {
    if (this.plans) return;
    this.authService.getAccountPlans().subscribe({
      next: ({ plans, payosConfigured }) => {
        this.plans = plans;
        this.payosConfigured = payosConfigured;
        this.planCode ||= plans[0]?.code ?? '';
        this.cdr.markForCheck();
      },
      error: () => {
        this.plans = [];
        this.errorMessage = 'Không tải được bảng giá gói dịch vụ. Vui lòng thử lại.';
        this.cdr.markForCheck();
      },
    });
  }

  private loadRenewal() {
    if (!this.token) {
      this.errorMessage = 'Liên kết gia hạn thiếu mã xác thực. Hãy mở lại liên kết trong email.';
      return;
    }
    this.run(this.authService.getAccountRenewal(this.token), (_, renewal) => {
      this.renewal = renewal;
      this.loadPlans();
    });
  }

  onRenew() {
    if (!this.planCode) {
      this.errorMessage = 'Vui lòng chọn gói dịch vụ.';
      return;
    }
    this.run(this.authService.createAccountOrder(this.token, this.planCode), (_, order) => {
      window.location.href = order.checkoutUrl;
    });
  }

  /** PayOS return page: confirms the payment with the server. */
  checkPayment() {
    const orderCode = this.route.snapshot.queryParamMap.get('orderCode') || '';
    if (!orderCode) {
      this.errorMessage = 'Không tìm thấy mã đơn thanh toán.';
      return;
    }
    this.run(this.authService.syncAccountOrder(orderCode), (_, result) => {
      this.payment = result;
    });
  }

  formatVnd(amount: number) {
    return amount.toLocaleString('vi-VN') + ' đ';
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
  private run<T>(
    request: Observable<T>,
    onSuccess: (message: string, result: T) => void,
    onError?: (err: { status: number; error?: { code?: string; message?: string; renewUrl?: string } }) => void,
  ) {
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
          onError?.(err);
        },
      });
  }

  private redirectByUserRole() {
    // Only same-app paths, so the query parameter cannot send the user to another site.
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '';
    if (/^\/(?![/\\])/.test(returnUrl)) {
      this.router.navigateByUrl(returnUrl);
      return;
    }
    this.router.navigate([this.authService.homePath()]);
  }
}
