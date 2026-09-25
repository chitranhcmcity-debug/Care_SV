import { ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';
import { NotificationService } from '../../services/notification.service';
import { IntegrationItem } from '../../models/types';

/** Admin: API keys for Claude (AI Care), Stringee (calls) and SMTP (email). */
@Component({
  selector: 'app-integrations-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './integrations-panel.component.html',
})
export class IntegrationsPanelComponent implements OnInit {
  private readonly settings = inject(SettingsService);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly groups = signal<{ name: string; items: IntegrationItem[] }[]>([]);
  readonly saving = signal(false);
  /** Values typed by the admin; only these are sent. '' clears the saved value. */
  draft: Record<string, string> = {};

  ngOnInit() {
    this.settings.getIntegrations().subscribe({
      next: (items) => this.show(items),
      error: (err) => this.notify.error(err.error?.message || 'Không tải được cấu hình API'),
    });
  }

  private show(items: IntegrationItem[]) {
    const names = [...new Set(items.map((i) => i.group))];
    this.groups.set(names.map((name) => ({ name, items: items.filter((i) => i.group === name) })));
    // Plain (non-secret) values are editable in place; secrets start empty.
    this.draft = Object.fromEntries(
      items.filter((i) => !i.secret && i.source === 'database').map((i) => [i.key, i.value]),
    );
    this.cdr.markForCheck();
  }

  sourceLabel(item: IntegrationItem): string {
    return item.source === 'database'
      ? 'Đã lưu trên giao diện'
      : item.source === 'env'
        ? 'Đang dùng file .env'
        : 'Chưa cấu hình';
  }

  async clear(item: IntegrationItem) {
    const ok = await this.notify.confirm({
      title: `Xóa ${item.group} — ${item.label}?`,
      message: 'Hệ thống sẽ quay về giá trị trong file .env (nếu có).',
      confirmText: 'Xóa',
      danger: true,
    });
    if (ok) this.save({ [item.key]: '' });
  }

  saveDraft() {
    const values = Object.fromEntries(
      Object.entries(this.draft).filter(([, v]) => typeof v === 'string' && v.trim()),
    );
    if (!Object.keys(values).length) {
      this.notify.info('Chưa có giá trị nào thay đổi');
      return;
    }
    this.save(values);
  }

  private save(values: Record<string, string>) {
    this.saving.set(true);
    this.settings.updateIntegrations(values).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.show(res.items);
        this.notify.success(res.message);
      },
      error: (err) => {
        this.saving.set(false);
        this.notify.error(err.error?.message || 'Không lưu được cấu hình API');
      },
    });
  }
}
