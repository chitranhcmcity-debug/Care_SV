import { Component, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Student, Student360Profile } from '../../models/types';
import { StudentInput, StudentService } from '../../services/student.service';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { CallTaskService } from '../../services/call-task.service';
import { CallLog, CallService, CALL_OUTCOME_LABELS } from '../../services/call.service';

const PAGE_SIZE = 20;
const EMPTY_FORM: StudentInput = {
  studentCode: '',
  fullName: '',
  classCode: '',
  dob: '',
  major: '',
  phone: '',
  parentPhone: '',
};

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
  private readonly notify = inject(NotificationService);
  /** Add / edit / delete students (same permission as the Excel import). */
  readonly canManage = inject(AuthService).can('excel.import');

  /** Add/edit form: null = closed; editingId '' = adding a new student. */
  form: StudentInput | null = null;
  editingId = '';
  readonly saving = signal(false);

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

  openForm(student?: Student) {
    this.editingId = student?._id ?? '';
    this.form = { ...EMPTY_FORM };
    if (student)
      for (const key of Object.keys(EMPTY_FORM) as (keyof StudentInput)[])
        this.form[key] = student[key] ?? '';
  }

  saveForm() {
    if (!this.form) return;
    this.saving.set(true);
    const request = this.editingId
      ? this.studentsApi.update(this.editingId, this.form)
      : this.studentsApi.create(this.form);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.notify.success(this.editingId ? 'Đã cập nhật sinh viên' : 'Đã thêm sinh viên');
        if (this.selected()?._id === saved._id) this.selected.set(saved);
        this.form = null;
        this.refresh();
      },
      error: (err) => {
        this.saving.set(false);
        this.notify.error(err.error?.message || 'Không lưu được sinh viên');
      },
    });
  }

  async remove(student: Student) {
    const ok = await this.notify.confirm({
      title: `Xóa sinh viên ${student.fullName}?`,
      message:
        'Sinh viên sẽ bị gỡ khỏi các học phần; điểm danh, nhiệm vụ gọi điện và lịch sử cuộc gọi của sinh viên cũng bị xóa. Không thể hoàn tác.',
      confirmText: 'Xóa',
      danger: true,
    });
    if (!ok) return;
    this.studentsApi.remove(student._id).subscribe({
      next: (res) => {
        this.notify.success(res.message);
        if (this.selected()?._id === student._id) this.selected.set(null);
        // Step back a page when the last row of the last page was removed.
        this.refresh(this.items().length === 1 && this.page() > 1 ? this.page() - 1 : this.page());
      },
      error: (err) => this.notify.error(err.error?.message || 'Không xóa được sinh viên'),
    });
  }

  private refresh(page = this.page()) {
    this.studentsApi.classes().subscribe((c) => this.classes.set(c));
    this.load(page);
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
