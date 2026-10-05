import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AuthService, Registration } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';

const ROLE_LABEL: Record<Registration['role'], string> = {
  staff: 'Nhân viên',
  teacher: 'Giảng viên',
};

/**
 * Trưởng phòng / PHT: các đăng ký đang chờ duyệt. Duyệt sẽ gửi email cho người đăng ký một
 * key kích hoạt; key cũng hiện ở đây một lần phòng khi email không bao giờ tới.
 */
@Component({
  selector: 'app-account-approvals',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './duyet-tai-khoan.component.html',
  styleUrl: './duyet-tai-khoan.component.css',
})
export class AccountApprovalsComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);

  readonly items = signal<Registration[]>([]);
  readonly loading = signal(true);
  readonly busyId = signal('');
  /** Các key đã cấp trong phiên này, theo id tài khoản, kèm việc email đã gửi đi hay chưa. */
  readonly shownKeys = signal<Record<string, { key: string; emailSent: boolean }>>({});
  /** Tài khoản được mở từ link trong email duyệt. */
  readonly focusId = signal('');
  readonly roleLabel = ROLE_LABEL;

  readonly pending = computed(() => this.items().filter((r) => r.status === 'pending'));
  readonly awaitingKey = computed(() => this.items().filter((r) => r.status === 'awaiting_key'));

  ngOnInit() {
    this.focusId.set(this.route.snapshot.queryParamMap.get('id') || '');
    this.load();
  }

  load() {
    this.loading.set(true);
    this.auth.getRegistrations().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.notify.error(err.error?.message || 'Không tải được danh sách đăng ký');
      },
    });
  }

  approve(r: Registration) {
    this.busyId.set(r._id);
    this.auth.approveRegistration(r._id).subscribe({
      next: (res) => {
        this.busyId.set('');
        if (res.activationKey) {
          const shown = { key: res.activationKey, emailSent: res.emailSent };
          this.shownKeys.update((keys) => ({ ...keys, [r._id]: shown }));
        }
        if (res.emailSent) this.notify.success(res.message);
        else this.notify.info(res.message);
        this.load();
      },
      error: (err) => {
        this.busyId.set('');
        this.notify.error(err.error?.message || 'Không xác nhận được tài khoản');
        this.load();
      },
    });
  }

  reject(r: Registration) {
    if (!confirm(`Từ chối yêu cầu đăng ký của ${r.fullName}? Tài khoản này sẽ bị xóa.`)) return;
    this.busyId.set(r._id);
    this.auth.rejectRegistration(r._id).subscribe({
      next: (res) => {
        this.busyId.set('');
        this.notify.success(res.message);
        this.load();
      },
      error: (err) => {
        this.busyId.set('');
        this.notify.error(err.error?.message || 'Không từ chối được yêu cầu');
        this.load();
      },
    });
  }

  copyKey(key: string) {
    navigator.clipboard
      ?.writeText(key)
      .then(() => this.notify.success('Đã sao chép key'))
      .catch(() => this.notify.error('Không sao chép được, hãy bôi đen key để copy'));
  }

  initial(name: string) {
    return (name || '?').trim().charAt(0).toUpperCase();
  }
}
