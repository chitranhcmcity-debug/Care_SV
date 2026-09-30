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
 * Trưởng phòng / PHT: self sign-ups waiting for approval. Approving emails the applicant an
 * activation key; if that email fails, the key is shown here once so it can be handed over.
 */
@Component({
  selector: 'app-account-approvals',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './account-approvals.component.html',
  styleUrl: './account-approvals.component.css',
})
export class AccountApprovalsComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);

  readonly items = signal<Registration[]>([]);
  readonly loading = signal(true);
  readonly busyId = signal('');
  /** Keys the server returned because the email could not be sent, by account id. */
  readonly shownKeys = signal<Record<string, string>>({});
  /** Account opened from the approval email link. */
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
          this.shownKeys.update((keys) => ({ ...keys, [r._id]: res.activationKey! }));
          this.notify.info(res.message);
        } else {
          this.notify.success(res.message);
        }
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

  initial(name: string) {
    return (name || '?').trim().charAt(0).toUpperCase();
  }
}
