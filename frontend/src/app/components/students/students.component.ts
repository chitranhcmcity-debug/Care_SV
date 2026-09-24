import { Component, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Student, Student360Profile } from '../../models/types';
import { StudentService } from '../../services/student.service';
import { CallTaskService } from '../../services/call-task.service';
import { CallLog, CallService, CALL_OUTCOME_LABELS } from '../../services/call.service';

const PAGE_SIZE = 20;

/** Admin / Trưởng phòng / Phó hiệu trưởng: every student's record, history and calls. */
@Component({
  selector: 'app-students',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './students.component.html',
})
export class StudentsComponent implements OnInit {
  private readonly studentsApi = inject(StudentService);
  private readonly callTasks = inject(CallTaskService);
  readonly calls = inject(CallService);

  search = '';
  classCode = '';
  readonly classes = signal<string[]>([]);
  readonly items = signal<Student[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly pageSize = PAGE_SIZE;

  readonly selected = signal<Student | null>(null);
  readonly profile = signal<Student360Profile | null>(null);
  readonly studentCalls = signal<CallLog[]>([]);
  readonly outcomeLabels: Record<string, string> = CALL_OUTCOME_LABELS;

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Refresh the open profile's call list after a call is saved from the dialog.
    effect(() => {
      this.calls.savedVersion();
      const student = untracked(() => this.selected());
      if (student) untracked(() => this.loadStudentCalls(student._id));
    });
  }

  ngOnInit() {
    this.studentsApi.classes().subscribe((c) => this.classes.set(c));
    this.load();
  }

  load(page = 1) {
    this.loading.set(true);
    this.page.set(page);
    this.studentsApi
      .list({ search: this.search.trim(), classCode: this.classCode, page, limit: PAGE_SIZE })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  onSearchInput() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(1), 300);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
  }

  open(student: Student) {
    this.selected.set(student);
    this.profile.set(null);
    this.callTasks.getStudent360Profile(student._id).subscribe((p) => this.profile.set(p));
    this.loadStudentCalls(student._id);
  }

  call(student: Student) {
    this.calls.open({ student });
  }

  private loadStudentCalls(studentId: string) {
    this.calls.list({ studentId, limit: 10 }).subscribe((res) => this.studentCalls.set(res.items));
  }

  callerName(call: CallLog): string {
    return typeof call.callerId === 'string' ? '' : call.callerId.fullName;
  }
}
