import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { OverviewService, SystemOverview } from '../../services/overview.service';
import { ROLE_LABELS, Role } from '../../models/types';

const REFRESH_MS = 60_000;
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Admin landing tab: accounts, data, 7-day activity, subscription and integrations. */
@Component({
  selector: 'app-system-overview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './system-overview.component.html',
})
export class SystemOverviewComponent implements OnInit, OnDestroy {
  private readonly overview = inject(OverviewService);

  readonly data = signal<SystemOverview | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly updatedAt = signal<Date | null>(null);
  /** Hovered bar: which chart and day index. */
  readonly hovered = signal<{ chart: 'attendance' | 'calls'; index: number } | null>(null);
  readonly roles: Role[] = ['admin', 'manager', 'staff', 'teacher'];
  readonly roleLabels = ROLE_LABELS;
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit() {
    this.load();
    this.timer = setInterval(() => this.load(), REFRESH_MS);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  load() {
    this.loading.set(true);
    this.overview.get().subscribe({
      next: (data) => {
        this.data.set(data);
        this.error.set('');
        this.updatedAt.set(new Date());
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Không tải được tổng quan hệ thống.');
        this.loading.set(false);
      },
    });
  }

  total(chart: 'attendance' | 'calls'): number {
    return (this.data()?.activity ?? []).reduce((sum, day) => sum + day[chart], 0);
  }

  /** Bar height in %, against the largest day of that chart (at least 1 to avoid /0). */
  barHeight(chart: 'attendance' | 'calls', value: number): number {
    const max = Math.max(1, ...(this.data()?.activity ?? []).map((d) => d[chart]));
    return (value / max) * 100;
  }

  dayLabel(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${d}/${m}`;
  }

  get pendingUsers(): number {
    return this.data()?.users.byStatus.unverified ?? 0;
  }

  get missingIntegrations(): string[] {
    return (this.data()?.integrations ?? []).filter((i) => !i.configured).map((i) => i.name);
  }
}
