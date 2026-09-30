import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StudentService, TimetableEntry } from '../../services/student.service';
import { AuthService } from '../../services/auth.service';
import { ViLabelPipe } from '../../utils/label.pipe';

const WEEK = ['thu_2', 'thu_3', 'thu_4', 'thu_5', 'thu_6', 'thu_7', 'chu_nhat'];
const SHIFT_ORDER: Record<string, number> = { sang: 0, chieu: 1, toi: 2 };
const SHIFTS = [
  { key: 'sang', label: 'Ca sáng' },
  { key: 'chieu', label: 'Ca chiều' },
  { key: 'toi', label: 'Ca tối' },
];
/** Card icons (book, monitor, database, palette, calculator, code), one per colour tone. */
const COURSE_ICONS = [
  'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z',
  'M3 4h18v12H3zM8 20h8M12 16v4',
  'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 3-4 3h-2a2 2 0 0 0-1 3.7A2 2 0 0 1 12 22M7.5 11h.01M10.5 7h.01M15.5 8h.01',
  'M5 3h14v18H5zM8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h8',
  'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
];

interface Slot {
  key: string;
  start: string;
  end: string;
}

/** Weekly timetable of every course group (read-only, no student data). */
@Component({
  selector: 'app-timetable',
  standalone: true,
  imports: [CommonModule, ViLabelPipe],
  templateUrl: './timetable.component.html',
  styleUrl: './timetable.component.css',
})
export class TimetableComponent implements OnInit {
  private readonly students = inject(StudentService);
  readonly auth = inject(AuthService);

  readonly entries = signal<TimetableEntry[]>([]);
  readonly loading = signal(true);
  readonly onlyMine = signal(false);
  readonly week = WEEK;
  readonly shifts = SHIFTS;
  readonly icons = COURSE_ICONS;
  readonly selected = signal<{ entry: TimetableEntry; day: string } | null>(null);

  open(entry: TimetableEntry, day: string) {
    this.selected.set({ entry, day });
  }

  @HostListener('document:keydown.escape')
  close() {
    this.selected.set(null);
  }

  /** Monday of the week being viewed. */
  readonly weekStart = signal(this.mondayOf(new Date()));
  readonly groupFilter = signal('');
  readonly view = signal<'week' | 'list'>('week');

  readonly weekDates = computed(() => {
    const m = this.weekStart();
    return WEEK.map((_, i) => new Date(m.getFullYear(), m.getMonth(), m.getDate() + i));
  });
  readonly isThisWeek = computed(
    () => this.weekStart().getTime() === this.mondayOf(new Date()).getTime(),
  );

  /** Group codes for the class filter. */
  readonly groupCodes = computed(() =>
    [...new Set(this.entries().map((e) => e.groupCode))].sort((a, b) => a.localeCompare(b)),
  );

  shiftWeek(delta: number) {
    const m = this.weekStart();
    this.weekStart.set(new Date(m.getFullYear(), m.getMonth(), m.getDate() + delta * 7));
  }

  thisWeek() {
    this.weekStart.set(this.mondayOf(new Date()));
  }

  private mondayOf(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  }

  private dayKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Every class meeting in the viewed week (respecting course start/end dates and filters). */
  readonly occurrences = computed(() => {
    const code = this.groupFilter();
    const list = this.entries().filter(
      (e) => (!this.onlyMine() || e.isMine) && (!code || e.groupCode === code),
    );
    const dates = this.weekDates();
    const out: { entry: TimetableEntry; day: string; date: Date }[] = [];
    for (const e of list) {
      const from = e.startDate ? this.dayKey(new Date(e.startDate)) : '';
      const to = e.endDate ? this.dayKey(new Date(e.endDate)) : '';
      for (const day of e.scheduleDays ?? []) {
        const i = WEEK.indexOf(day);
        if (i < 0) continue;
        const key = this.dayKey(dates[i]);
        if ((from && key < from) || (to && key > to)) continue;
        out.push({ entry: e, day, date: dates[i] });
      }
    }
    return out.sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() ||
        this.slotOrder(a.entry).localeCompare(this.slotOrder(b.entry)),
    );
  });

  private slotOrder(e: TimetableEntry): string {
    return e.startTime || `~${SHIFT_ORDER[e.shift ?? ''] ?? 9}`;
  }

  /** Distinct time slots (rows of the grid), ordered by start time then shift. */
  readonly slots = computed<Slot[]>(() => {
    const map = new Map<string, Slot & { order: string }>();
    for (const { entry: e } of this.occurrences()) {
      const key = this.slotKey(e);
      if (!map.has(key))
        map.set(key, {
          key,
          start: e.startTime || '',
          end: e.endTime || '',
          order: this.slotOrder(e),
        });
    }
    return [...map.values()].sort((a, b) => a.order.localeCompare(b.order));
  });

  /** Course groups per weekday, then per slot. */
  readonly grid = computed(() => {
    const days: Record<string, Record<string, TimetableEntry[]>> = Object.fromEntries(
      WEEK.map((d) => [d, {}]),
    );
    const counts: Record<string, number> = Object.fromEntries(WEEK.map((d) => [d, 0]));
    for (const { entry, day } of this.occurrences()) {
      (days[day][this.slotKey(entry)] ??= []).push(entry);
      counts[day]++;
    }
    return { days, counts };
  });

  slotKey(e: TimetableEntry): string {
    return e.startTime ? `${e.startTime}-${e.endTime ?? ''}` : `shift:${e.shift ?? ''}`;
  }

  slotLabel(s: Slot): string {
    return s.start ? '' : s.key.replace('shift:', '');
  }

  /** Stable colour tone per course so the same course looks the same every day. */
  tone(e: TimetableEntry): number {
    const code = e.courseCode || e.groupCode;
    let h = 0;
    for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % COURSE_ICONS.length;
  }

  ngOnInit() {
    this.onlyMine.set(this.auth.isTeacher());
    this.students.timetable().subscribe({
      next: (entries) => {
        this.entries.set(entries);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
