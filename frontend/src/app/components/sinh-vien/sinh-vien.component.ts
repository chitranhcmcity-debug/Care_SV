import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Student, Student360Profile } from '../../models/types';
import { StudentInput, StudentService } from '../../services/student.service';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { Router } from '@angular/router';
import { ViLabelPipe } from '../../utils/label.pipe';
import { CareCaseService, CareCaseSummary } from '../../services/care-case.service';
import { CallLog, CallService, CALL_OUTCOME_LABELS } from '../../services/call.service';

const PAGE_SIZE = 20;
// Màu avatar: mỗi sinh viên luôn có cùng một cặp màu, chọn theo MSSV.
const AVATAR_GRADIENTS = [
  ['#8b5cf6', '#ec4899'],
  ['#06b6d4', '#3b82f6'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#06b6d4'],
  ['#6366f1', '#a855f7'],
  ['#f43f5e', '#f97316'],
];
const EMPTY_FORM: StudentInput = {
  studentCode: '',
  fullName: '',
  classCode: '',
  dob: '',
  major: '',
  phone: '',
  parentPhone: '',
};

/** Admin / Trưởng phòng / Phó hiệu trưởng: hồ sơ, lịch sử và cuộc gọi của mọi sinh viên. */
@Component({
  selector: 'app-students',
  standalone: true,
  imports: [CommonModule, FormsModule, ViLabelPipe],
  templateUrl: './sinh-vien.component.html',
  styleUrl: './sinh-vien.component.css',
})
export class StudentsComponent implements OnInit {
  private readonly studentsApi = inject(StudentService);
  private readonly careCases = inject(CareCaseService);
  private readonly router = inject(Router);
  readonly calls = inject(CallService);
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);
  /** Thêm / sửa / xóa sinh viên (cùng quyền với nhập Excel). */
  readonly canManage = this.auth.can('excel.import');
  /** Trưởng phòng / PHT nghe được mọi bản ghi âm, nên họ thấy mọi cuộc gọi tới sinh viên. */
  readonly seesAllCalls = this.auth.can('recordings.viewAll');
  readonly canOpenCare =
    !this.auth.isAdmin() && (this.auth.can('care.manage') || this.auth.can('care.propose'));
  /** Các hồ sơ chăm sóc của sinh viên, mới nhất trước (tối đa một hồ sơ đang mở). */
  readonly studentCases = signal<CareCaseSummary[]>([]);
  readonly openCase = computed(() => this.studentCases().find((c) => c.status !== 'da_ket_thuc'));
  /** Form đề xuất trong hồ sơ: null = đóng. */
  proposal: { reason: string } | null = null;

  /** Form thêm/sửa: null = đóng; editingId '' = đang thêm sinh viên mới. */
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
  /** Hồ sơ liệt kê các cuộc gọi mới nhất trước; phần còn lại mở khi được yêu cầu. */
  readonly callsPreview = 3;
  readonly showAllCalls = signal(false);
  readonly visibleCalls = computed(() =>
    this.showAllCalls() ? this.studentCalls() : this.studentCalls().slice(0, this.callsPreview),
  );
  readonly outcomeLabels: Record<string, string> = CALL_OUTCOME_LABELS;

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Làm mới danh sách cuộc gọi của hồ sơ đang mở sau khi một cuộc gọi được lưu từ hộp thoại.
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
    this.showAllCalls.set(false);
    this.proposal = null;
    this.studentCases.set([]);
    this.studentsApi.profile(student._id).subscribe((p) => this.profile.set(p));
    this.careCases.forStudent(student._id).subscribe((c) => this.studentCases.set(c));
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
        'Sinh viên sẽ bị gỡ khỏi các học phần; điểm danh, hồ sơ chăm sóc và lịch sử cuộc gọi của sinh viên cũng bị xóa. Không thể hoàn tác.',
      confirmText: 'Xóa',
      danger: true,
    });
    if (!ok) return;
    this.studentsApi.remove(student._id).subscribe({
      next: (res) => {
        this.notify.success(res.message);
        if (this.selected()?._id === student._id) this.selected.set(null);
        // Lùi một trang khi dòng cuối của trang cuối bị xóa.
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
    this.calls
      .list({ studentId, limit: 10, scope: this.seesAllCalls ? 'all' : undefined })
      .subscribe((res) => this.studentCalls.set(res.items));
  }

  goToCase(id: string) {
    this.router.navigate(['/care'], { queryParams: { case: id } });
  }

  /** Mở hồ sơ chăm sóc cho sinh viên: một đề xuất, hoặc đang chờ chỉ đạo của quản lý. */
  submitProposal(student: Student) {
    const reason = this.proposal?.reason.trim();
    if (!reason) return this.notify.error('Nhập lý do cần chăm sóc');
    this.careCases.create({ studentId: student._id, reason }).subscribe({
      next: (c) => {
        this.notify.success('Đã mở hồ sơ chăm sóc');
        this.goToCase(c._id);
      },
      error: (err) => {
        if (err.status === 409 && err.error?.caseId) this.goToCase(err.error.caseId);
        else this.notify.error(err.error?.message || 'Không mở được hồ sơ');
      },
    });
  }

  callerName(call: CallLog): string {
    return typeof call.callerId === 'string' ? '' : call.callerId.fullName;
  }

  /** "Phạm Ngọc Yến" → "PY": chữ cái đầu của họ và của tên. */
  initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    const first = words[0][0];
    return (words.length > 1 ? first + words[words.length - 1][0] : first).toUpperCase();
  }

  avatarBackground(code: string): string {
    const hash = [...code].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const [from, to] = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
    return `linear-gradient(135deg, ${from}, ${to})`;
  }

  /** Ô màu ổn định (0–5) cho một mã lớp, để mỗi lớp giữ cùng màu chip. */
  classTone(code = ''): number {
    return [...code].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 6;
  }
}
