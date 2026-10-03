import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ParentAlert,
  ParentAlertPage,
  ParentAlertService,
  ParentAlertStatus,
} from '../../services/parent-alert.service';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';

const STATUS: Record<ParentAlertStatus, { label: string; tone: string }> = {
  da_gui: { label: 'Đã gửi', tone: 'is-sent' },
  gui_loi: { label: 'Gửi lỗi', tone: 'is-failed' },
  chua_cau_hinh: { label: 'Chưa cấu hình Zalo', tone: 'is-pending' },
  thieu_sdt: { label: 'Thiếu SĐT phụ huynh', tone: 'is-pending' },
};

/** Report of the Zalo messages sent to parents of students absent too often in one week. */
@Component({
  selector: 'app-parent-alerts-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './parent-alerts-panel.component.html',
  styleUrl: './parent-alerts-panel.component.css',
})
export class ParentAlertsPanelComponent implements OnInit {
  private readonly service = inject(ParentAlertService);
  private readonly notify = inject(NotificationService);
  /** Re-sending is the manager's call; the admin only reads the report. */
  readonly canResend = inject(AuthService).isManager();

  readonly statuses = Object.entries(STATUS).map(([value, s]) => ({
    value: value as ParentAlertStatus,
    ...s,
  }));
  readonly data = signal<ParentAlertPage | null>(null);
  readonly filter = signal<ParentAlertStatus | ''>('');
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly resending = signal<string | null>(null);
  readonly open = signal<string | null>(null);
  readonly pages = computed(() => {
    const d = this.data();
    return d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  });
  readonly totalAll = computed(() =>
    Object.values(this.data()?.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0),
  );

  ngOnInit() {
    this.load();
  }

  status(alert: ParentAlert) {
    return STATUS[alert.status] ?? { label: alert.status, tone: '' };
  }

  setFilter(value: ParentAlertStatus | '') {
    this.filter.set(value);
    this.page.set(1);
    this.load();
  }

  goTo(page: number) {
    this.page.set(Math.min(Math.max(page, 1), this.pages()));
    this.load();
  }

  load() {
    this.loading.set(true);
    this.service.list(this.page(), this.filter()).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.notify.error(err.error?.message || 'Không tải được báo cáo tin Zalo');
      },
    });
  }

  resend(alert: ParentAlert) {
    this.resending.set(alert._id);
    this.service.resend(alert._id).subscribe({
      next: (res) => {
        this.resending.set(null);
        if (res.alert.status === 'da_gui') this.notify.success(res.message);
        else this.notify.error(res.message);
        this.load();
      },
      error: (err) => {
        this.resending.set(null);
        this.notify.error(err.error?.message || 'Không gửi lại được');
      },
    });
  }

  toggle(id: string) {
    this.open.update((current) => (current === id ? null : id));
  }

  dm(day: string) {
    return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  }
}
