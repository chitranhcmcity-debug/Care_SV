import { ChangeDetectorRef, Component, OnInit, isDevMode, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, Observable } from 'rxjs';
import { AccountPaymentResult, AccountRenewal, AuthService } from '../../services/auth.service';
import type { SubscriptionPlan } from '../../services/billing.service';
import { BrandingService } from '../../services/branding.service';

// Tài khoản phát triển cục bộ. Chỉ điền tên đăng nhập; mật khẩu nhập thủ công.
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

/** Màn xác thực mà route này hiển thị; đặt qua `data.mode` của route. */
export type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'renew' | 'payment';

const MIN_PASSWORD_LENGTH = 8;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dang-nhap.component.html',
  styleUrl: './dang-nhap.component.css',
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
  /** Giảng viên và nhân viên: email của Trưởng phòng / PHT mà họ làm việc dưới quyền. */
  managerEmail = '';
  /** SĐT phụ huynh có thể gọi lại (phụ huynh có thể gọi lại số này). */
  phone = '';
  /** Các gói Trưởng phòng / PHT mua cho tài khoản của mình (màn đăng ký và gia hạn). */
  plans: SubscriptionPlan[] | null = null;
  planCode = '';
  payosConfigured = true;
  /** Trang thanh toán / gia hạn cho tài khoản Trưởng phòng / PHT chưa thanh toán hoặc đã hết hạn (từ đăng nhập). */
  renewUrl = '';
  /** Màn gia hạn: link gửi qua email gia hạn cho tài khoản nào. */
  renewal: AccountRenewal | null = null;
  /** Màn kết quả thanh toán (trang quay về từ PayOS). */
  payment: AccountPaymentResult | null = null;
  showPassword = false;
  /** Đặt khi máy chủ báo tài khoản đã duyệt này vẫn cần key kích hoạt gửi qua email. */
  needsKey = false;
  activationKey = '';
  loading = false;
  errorMessage = '';
  successMessage = '';
  /** Màn đặt lại mở mà không có token trong URL. */
  linkMissing = false;
  /** Token dùng một lần từ link trong email (màn đặt lại). */
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
        // Lần hỏi đầu là hướng dẫn, không phải lỗi.
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
    if (this.role !== 'manager' && !this.managerEmail.trim()) {
      this.errorMessage = 'Vui lòng nhập email của Trưởng phòng / Phó hiệu trưởng quản lý bạn.';
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
        phone: this.phone.trim(),
        ...(this.role === 'manager'
          ? { planCode: this.planCode }
          : { managerEmail: this.managerEmail.trim() }),
      }),
      (message, result) => {
        // Trưởng phòng / PHT: chuyển sang PayOS; tài khoản hoạt động khi thanh toán được xác nhận.
        if (result.checkoutUrl) {
          window.location.href = result.checkoutUrl;
          return;
        }
        this.successMessage = message;
        this.password = this.confirmPassword = '';
      },
    );
  }

  /** Màn đăng ký: chọn Trưởng phòng / PHT sẽ nạp các gói để mua. */
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

  /** Trang quay về từ PayOS: xác nhận thanh toán với máy chủ. */
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

  /** Chạy một request với cách xử lý đang tải / lỗi / thành công dùng chung. */
  private run<T>(
    request: Observable<T>,
    onSuccess: (message: string, result: T) => void,
    onError?: (err: {
      status: number;
      error?: { code?: string; message?: string; renewUrl?: string };
    }) => void,
  ) {
    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    // Ứng dụng zoneless: kết quả bất đồng bộ chỉ lên màn hình sau markForCheck().
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
    // Chỉ đường dẫn trong cùng ứng dụng, để tham số truy vấn không đưa người dùng sang trang khác.
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '';
    if (/^\/(?![/\\])/.test(returnUrl)) {
      this.router.navigateByUrl(returnUrl);
      return;
    }
    this.router.navigate([this.authService.homePath()]);
  }
}
