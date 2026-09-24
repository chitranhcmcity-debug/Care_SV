import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StudentService, TimetableEntry } from '../../services/student.service';
import { AuthService } from '../../services/auth.service';
import { ViLabelPipe } from '../../utils/label.pipe';

const WEEK = ['thu_2', 'thu_3', 'thu_4', 'thu_5', 'thu_6', 'thu_7', 'chu_nhat'];
const SHIFT_ORDER: Record<string, number> = { sang: 0, chieu: 1, toi: 2 };
const SHIFT_TONE: Record<string, string> = {
  sang: 'bg-amber-50 border-amber-200 text-amber-900',
  chieu: 'bg-blue-50 border-blue-200 text-blue-900',
  toi: 'bg-violet-50 border-violet-200 text-violet-900',
};

/** Weekly timetable of every course group (read-only, no student data). */
@Component({
  selector: 'app-timetable',
  standalone: true,
  imports: [CommonModule, ViLabelPipe],
  templateUrl: './timetable.component.html',
})
export class TimetableComponent implements OnInit {
  private readonly students = inject(StudentService);
  readonly auth = inject(AuthService);

  readonly entries = signal<TimetableEntry[]>([]);
  readonly loading = signal(true);
  readonly onlyMine = signal(false);
  readonly week = WEEK;
  readonly shiftTone = SHIFT_TONE;

  /** Course groups per weekday, ordered by shift. */
  readonly byDay = computed(() => {
    const list = this.onlyMine() ? this.entries().filter((e) => e.isMine) : this.entries();
    const days: Record<string, TimetableEntry[]> = Object.fromEntries(WEEK.map((d) => [d, []]));
    for (const entry of list) for (const day of entry.scheduleDays ?? []) days[day]?.push(entry);
    for (const day of WEEK)
      days[day].sort(
        (a, b) => (SHIFT_ORDER[a.shift ?? ''] ?? 9) - (SHIFT_ORDER[b.shift ?? ''] ?? 9),
      );
    return days;
  });

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
