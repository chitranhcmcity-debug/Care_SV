import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StudentService, TimetableEntry } from '../../services/student.service';
import { AuthService } from '../../services/auth.service';
import { ViLabelPipe } from '../../utils/label.pipe';

const WEEK = ['thu_2', 'thu_3', 'thu_4', 'thu_5', 'thu_6', 'thu_7', 'chu_nhat'];
const SHIFT_ORDER: Record<string, number> = { sang: 0, chieu: 1, toi: 2 };
const SHIFT_HOURS: Record<string, [number, number]> = {
  sang: [7, 11],
  chieu: [13, 17],
  toi: [18, 21],
};
const SHIFTS = [
  { key: 'sang', label: 'Ca sáng' },
  { key: 'chieu', label: 'Ca chiều' },
  { key: 'toi', label: 'Ca tối' },
];
/** Icon thẻ (sách, màn hình, cơ sở dữ liệu, bảng màu, máy tính, mã), mỗi tông màu một icon. */
const COURSE_ICONS = [
  'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z',
  'M3 4h18v12H3zM8 20h8M12 16v4',
  'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 3-4 3h-2a2 2 0 0 0-1 3.7A2 2 0 0 1 12 22M7.5 11h.01M10.5 7h.01M15.5 8h.01',
  'M5 3h14v18H5zM8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h8',
  'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
];

/** Thời khóa biểu tuần của mọi học phần (chỉ đọc, không có dữ liệu sinh viên). */
@Component({
  selector: 'app-timetable',
  standalone: true,
  imports: [CommonModule, ViLabelPipe],
  templateUrl: './thoi-khoa-bieu.component.html',
  styleUrl: './thoi-khoa-bieu.component.css',
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

  /** Thứ Hai của tuần đang xem. */
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

  /** Mã nhóm cho bộ lọc lớp. */
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

  /** Mọi buổi học trong tuần đang xem (theo ngày bắt đầu/kết thúc học phần và bộ lọc). */
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

  /** Khoảng giờ dùng khi học phần không có giờ bắt đầu/kết thúc rõ ràng. */
  private hoursOf(e: TimetableEntry): [number, number] {
    const toH = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h + (m || 0) / 60;
    };
    if (e.startTime) {
      const s = toH(e.startTime);
      const end = e.endTime ? toH(e.endTime) : s + 1;
      return [s, Math.max(end, s + 1)];
    }
    return SHIFT_HOURS[e.shift ?? ''] ?? [7, 11];
  }

  /**
   * Lưới tuần từng giờ: mỗi giờ một dòng, mỗi khối lớp trải qua các giờ nó chiếm,
   * và mỗi giờ trống trong ngày có một ô giữ chỗ trống.
   */
  readonly layout = computed(() => {
    const occ = this.occurrences();
    let minH = 7;
    let maxH = 17;
    if (occ.length) {
      minH = 24;
      maxH = 0;
      for (const { entry } of occ) {
        const [s, e] = this.hoursOf(entry);
        minH = Math.min(minH, Math.floor(s));
        maxH = Math.max(maxH, Math.ceil(e));
      }
    }
    const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);

    // Các lớp trùng giờ trong cùng ngày dùng chung một khối; tách khối riêng cho chúng
    // sẽ chiếm cùng vùng lưới và che nhau.
    const blocks: {
      col: number;
      rowStart: number;
      rowEnd: number;
      day: string;
      entries: TimetableEntry[];
    }[] = [];
    const counts: Record<string, number> = Object.fromEntries(WEEK.map((d) => [d, 0]));
    const busy: Record<string, Set<number>> = Object.fromEntries(WEEK.map((d) => [d, new Set()]));
    const byDay: Record<string, { from: number; to: number; entry: TimetableEntry }[]> =
      Object.fromEntries(WEEK.map((d) => [d, []]));
    for (const { entry, day } of occ) {
      counts[day]++;
      const [s, e] = this.hoursOf(entry);
      const from = Math.floor(s);
      const to = Math.ceil(e);
      for (let h = from; h < to; h++) busy[day].add(h);
      byDay[day].push({ from, to, entry });
    }
    WEEK.forEach((day, i) => {
      const items = byDay[day].sort((a, b) => a.from - b.from || a.to - b.to);
      let cur: { from: number; to: number; entries: TimetableEntry[] } | null = null;
      const flush = () => {
        if (cur)
          blocks.push({
            col: i + 2,
            rowStart: cur.from - minH + 2,
            rowEnd: cur.to - minH + 2,
            day,
            entries: cur.entries,
          });
      };
      for (const it of items) {
        if (cur && it.from < cur.to) {
          cur.to = Math.max(cur.to, it.to);
          cur.entries.push(it.entry);
        } else {
          flush();
          cur = { from: it.from, to: it.to, entries: [it.entry] };
        }
      }
      flush();
    });

    const empties: { col: number; row: number }[] = [];
    WEEK.forEach((day, i) => {
      if (!counts[day]) return;
      for (const h of hours) if (!busy[day].has(h)) empties.push({ col: i + 2, row: h - minH + 2 });
    });

    return { hours, blocks, empties, counts };
  });

  /** Các buổi hôm nay, cho banner (bỏ qua tuần đang duyệt và bộ lọc lớp). */
  readonly todayCount = computed(() => {
    const now = new Date();
    const day = WEEK[(now.getDay() + 6) % 7];
    const key = this.dayKey(now);
    return this.entries().filter((e) => {
      if (this.onlyMine() && !e.isMine) return false;
      if (!(e.scheduleDays ?? []).includes(day)) return false;
      if (e.startDate && key < this.dayKey(new Date(e.startDate))) return false;
      if (e.endDate && key > this.dayKey(new Date(e.endDate))) return false;
      return true;
    }).length;
  });

  hourLabel(h: number): string {
    return `${String(h).padStart(2, '0')}:00`;
  }

  /** Tông màu ổn định theo học phần để cùng học phần trông giống nhau mỗi ngày. */
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
