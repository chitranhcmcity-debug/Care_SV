import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { OverviewService, SystemOverview } from '../../services/overview.service';
import { AuthService } from '../../services/auth.service';
import { ROLE_LABELS, Role } from '../../models/types';

const REFRESH_MS = 60_000;
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

type Activity = SystemOverview['activity'][number];
type CreatedKey = keyof Activity['created'];

// 24px stroke icon paths (Tabler-style).
const ICONS = {
  users:
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85',
  cap: 'M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 2.5 9 2.5 12 0v-5',
  book: 'M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h13M9 7h6',
  phone:
    'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  calendar:
    'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M3 10h18M9 15l2 2 4-4',
  alert:
    'M12 8v5m0 3.5h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a2 2 0 0 0 3.4 0',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  refresh: 'M20 11a8 8 0 0 0-14.9-3.9M4 5v4h4M4 13a8 8 0 0 0 14.9 3.9M20 19v-4h-4',
  check: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 12l2.5 2.5 4.5-5',
};

/** Fills fields an older API may not send yet, so one missing field cannot break the page. */
function withDefaults(d: SystemOverview): SystemOverview {
  return {
    ...d,
    callTasks: {
      ...d.callTasks,
      week: d.callTasks.week ?? { contacted: 0, pending: 0, unreachable: 0, callback: 0 },
    },
    warnings: d.warnings ?? { count: 0, items: [] },
    activity: d.activity.map((a) => ({
      ...a,
      students: a.students ?? { present: 0, excused: 0, absent: 0 },
      created: a.created ?? { users: 0, students: 0, courseGroups: 0, callTasks: 0 },
    })),
  };
}

/** Admin landing tab: accounts, data, 7-day activity, subscription and integrations. */
@Component({
  selector: 'app-system-overview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './system-overview.component.html',
  styleUrl: './system-overview.component.css',
})
export class SystemOverviewComponent implements OnInit, OnDestroy {
  private readonly overview = inject(OverviewService);
  private readonly auth = inject(AuthService);

  readonly icons = ICONS;
  readonly data = signal<SystemOverview | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly updatedAt = signal<Date | null>(null);
  /** Ticks every 30 s for the clock in the welcome banner. */
  readonly now = signal(new Date());
  /** Hovered day in the attendance chart. */
  readonly hovered = signal<number | null>(null);
  readonly roles: Role[] = ['admin', 'manager', 'staff', 'teacher'];
  readonly roleLabels = ROLE_LABELS;
  private timer?: ReturnType<typeof setInterval>;
  private clock?: ReturnType<typeof setInterval>;

  readonly userName = computed(() => this.auth.currentUser()?.fullName?.trim() || 'bạn');

  /** Headline cards: current value, what was added in 7 days and a 7-bar sparkline. */
  readonly stats = computed(() => {
    const d = this.data();
    if (!d) return [];
    const card = (
      label: string,
      value: number,
      sub: string,
      key: CreatedKey,
      icon: string,
      tone: string,
      cumulative: boolean,
    ) => ({
      label,
      value,
      sub,
      icon,
      tone,
      added: this.added(key),
      spark: cumulative ? this.cumulative(value, key) : d.activity.map((a) => a.created[key]),
    });
    return [
      card(
        'Tài khoản',
        d.users.total,
        `${d.users.byStatus.active || 0} hoạt động · ${d.users.byStatus.inactive || 0} vô hiệu hóa`,
        'users',
        ICONS.users,
        'st-violet',
        true,
      ),
      card(
        'Sinh viên',
        d.data.students,
        `${d.data.classes} lớp hành chính`,
        'students',
        ICONS.cap,
        'st-pink',
        true,
      ),
      card(
        'Nhóm học phần',
        d.data.courseGroups,
        `${d.data.groupsWithoutTeacher} chưa gán giảng viên`,
        'courseGroups',
        ICONS.book,
        'st-sky',
        true,
      ),
      card(
        'Nhiệm vụ gọi điện',
        d.callTasks.open,
        `đang mở · ${d.callTasks.contacted} đã liên hệ`,
        'callTasks',
        ICONS.phone,
        'st-amber',
        false,
      ),
    ];
  });

  /** Top of the stacked attendance chart's axis: the largest day, rounded up. */
  readonly attendanceMax = computed(() => {
    const totals = (this.data()?.activity ?? []).map((a) => this.dayTotal(a));
    // Four equal steps of 1, 2 or 5 × 10^n so every gridline gets a round label.
    const raw = Math.max(4, ...totals) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((m) => m * magnitude).find((v) => v >= raw)!;
    return step * 4;
  });

  readonly axisTicks = computed(() => {
    const max = this.attendanceMax();
    return [4, 3, 2, 1, 0].map((i) => Math.round((max * i) / 4));
  });

  /** Call tasks of the week as donut segments (contacted, not called, unreachable, callback). */
  readonly donut = computed(() => {
    const week = this.data()?.callTasks.week;
    if (!week) return null;
    const parts = [
      { label: 'Đã liên hệ', value: week.contacted, color: '#34d399' },
      { label: 'Chưa gọi', value: week.pending, color: '#60a5fa' },
      { label: 'Không bắt máy', value: week.unreachable, color: '#fbbf24' },
      { label: 'Hẹn gọi lại', value: week.callback, color: '#c084fc' },
    ];
    const total = parts.reduce((sum, p) => sum + p.value, 0);
    let from = 0;
    const stops = parts.map((p) => {
      const to = from + (total ? (p.value / total) * 100 : 0);
      const stop = `${p.color} ${from}% ${to}%`;
      from = to;
      return stop;
    });
    return {
      total,
      parts: parts.map((p) => ({ ...p, percent: total ? (p.value / total) * 100 : 0 })),
      gradient: total ? `conic-gradient(${stops.join(', ')})` : 'conic-gradient(#ede9fe 0 100%)',
    };
  });

  ngOnInit() {
    this.load();
    this.timer = setInterval(() => {
      if (!document.hidden) this.load();
    }, REFRESH_MS);
    this.clock = setInterval(() => this.now.set(new Date()), 30_000);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
    clearInterval(this.clock);
  }

  load() {
    this.loading.set(true);
    this.overview.get().subscribe({
      next: (data) => {
        this.data.set(withDefaults(data));
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

  /** Records of one kind created in the last 7 days. */
  added(key: CreatedKey): number {
    return (this.data()?.activity ?? []).reduce((sum, day) => sum + day.created[key], 0);
  }

  /** Running total at the end of each of the 7 days, ending at today's `value`. */
  private cumulative(value: number, key: CreatedKey): number[] {
    const activity = this.data()?.activity ?? [];
    let later = 0;
    const totals: number[] = [];
    for (let i = activity.length - 1; i >= 0; i--) {
      totals.unshift(value - later);
      later += activity[i].created[key];
    }
    return totals;
  }

  /** Sparkline bar heights in %, scaled from the smallest to the largest value. */
  sparkHeights(values: number[]): number[] {
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (max === 0) return values.map(() => 12);
    if (max === min) return values.map(() => 70);
    return values.map((v) => 25 + ((v - min) / (max - min)) * 75);
  }

  dayTotal(day: Activity): number {
    return day.students.present + day.students.excused + day.students.absent;
  }

  segment(value: number): number {
    return (value / this.attendanceMax()) * 100;
  }

  dayLabel(date: string): string {
    const [, m, d] = date.split('-');
    return `${d}/${m}`;
  }

  fullDayLabel(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }

  greetingIcon(): string {
    const h = this.now().getHours();
    return h < 11 ? '☀️' : h < 18 ? '🌤️' : '🌙';
  }

  weekday(date: Date): string {
    return date.getDay() === 0 ? 'Chủ nhật' : `Thứ ${date.getDay() + 1}`;
  }

  /** "3 giờ trước", "2 ngày trước"... */
  timeAgo(value: string): string {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
    if (minutes < 60) return minutes <= 1 ? 'Vừa xong' : `${minutes} phút trước`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return `${Math.round(hours / 24)} ngày trước`;
  }

  /** Share of all accounts held by one role, in % (for the small bar next to each role). */
  roleShare(role: Role): number {
    const users = this.data()?.users;
    return users?.total ? ((users.byRole[role] || 0) / users.total) * 100 : 0;
  }

  /** "Trần Thị Mai" → "TM". */
  initials(name = ''): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  }

  integrationIcon(name: string): string {
    const n = name.toLowerCase();
    if (n.includes('ai')) return '🤖';
    if (n.includes('stringee') || n.includes('tổng đài')) return '☎️';
    if (n.includes('email') || n.includes('smtp')) return '✉️';
    if (n.includes('payos')) return '💳';
    return '🔗';
  }

  get pendingUsers(): number {
    return this.data()?.users.byStatus.unverified ?? 0;
  }

  get missingIntegrations(): string[] {
    return (this.data()?.integrations ?? []).filter((i) => !i.configured).map((i) => i.name);
  }

  /** Items for the "Cần chú ý" strip. */
  attentionCount(d: SystemOverview): number {
    return (
      Number(!d.subscription.active || d.subscription.daysLeft <= 7) +
      Number(this.pendingUsers > 0) +
      Number(d.data.classesWithoutStaff > 0) +
      Number(this.missingIntegrations.length > 0)
    );
  }
}
