import { ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';
import { NotificationService } from '../../services/notification.service';
import { SystemSettings, WarningLevel } from '../../models/types';

const PALETTE = ['#eab308', '#f97316', '#ef4444', '#dc2626', '#9333ea', '#2563eb'];

/**
 * Trưởng phòng / PHT: absence warning levels (name, threshold in periods or % of total
 * periods, colour, exam ban) plus the absence-reason and student-tag lists used by CSKH.
 */
@Component({
  selector: 'app-warning-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './warning-config.component.html',
})
export class WarningConfigComponent implements OnInit {
  private readonly settings = inject(SettingsService);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  levels: WarningLevel[] = [];
  absenceReasons: string[] = [];
  tags: string[] = [];
  newReason = '';
  newTag = '';
  readonly saving = signal(false);

  ngOnInit() {
    this.settings.getSettings().subscribe({
      next: (s) => this.load(s),
      error: (err) => this.notify.error(err.error?.message || 'Không tải được cấu hình'),
    });
  }

  private load(s: SystemSettings) {
    this.levels = (s.warningLevels || []).map((l) => ({ ...l }));
    this.absenceReasons = [...(s.absenceReasons || [])];
    this.tags = [...(s.tags || [])];
    this.cdr.markForCheck();
  }

  addLevel() {
    if (this.levels.length >= 10) return;
    const last = this.levels.at(-1);
    this.levels.push({
      name: `Mức ${this.levels.length + 1}`,
      unit: last?.unit ?? 'percent',
      threshold: (last?.threshold ?? 5) + 5,
      color: PALETTE[this.levels.length % PALETTE.length],
      examBan: false,
    });
  }

  removeLevel(i: number) {
    if (this.levels.length > 1) this.levels.splice(i, 1);
  }

  move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= this.levels.length) return;
    [this.levels[i], this.levels[j]] = [this.levels[j], this.levels[i]];
  }

  /** Human-readable rule for one level, e.g. "Nghỉ từ 20% tổng số tiết → cấm thi". */
  describe(level: WarningLevel): string {
    const amount =
      level.unit === 'percent' ? `${level.threshold}% tổng số tiết` : `${level.threshold} tiết`;
    return `Nghỉ từ ${amount} trở lên${level.examBan ? ' → cấm thi' : ''}`;
  }

  addItem(list: 'absenceReasons' | 'tags', value: string) {
    const v = value.trim();
    if (!v || this[list].includes(v)) return;
    this[list].push(v);
    if (list === 'tags') this.newTag = '';
    else this.newReason = '';
  }

  removeItem(list: 'absenceReasons' | 'tags', value: string) {
    this[list] = this[list].filter((x) => x !== value);
  }

  save() {
    this.saving.set(true);
    this.settings
      .updateCareSettings({
        warningLevels: this.levels.map((l) => ({ ...l, threshold: Number(l.threshold) })),
        absenceReasons: this.absenceReasons,
        tags: this.tags,
      })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.load(res.settings);
          this.notify.success(res.message);
        },
        error: (err) => {
          this.saving.set(false);
          this.notify.error(err.error?.message || 'Không lưu được cấu hình cảnh báo');
        },
      });
  }
}
