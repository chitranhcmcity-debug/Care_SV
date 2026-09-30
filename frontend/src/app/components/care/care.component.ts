import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  CareCase,
  CareCaseService,
  CareCaseSummary,
  CareNote,
  CareStaffOption,
  CareStep,
} from '../../services/care-case.service';
import { AuthService } from '../../services/auth.service';
import { AiService } from '../../services/ai.service';
import { CallService, CallTarget, CALL_OUTCOME_LABELS } from '../../services/call.service';
import { NotificationService } from '../../services/notification.service';
import { StudentService } from '../../services/student.service';
import { CareIconComponent, CareIcon } from './care-icon.component';
import { CareHeaderComponent } from './care-header.component';
import { CareListComponent } from './care-list.component';
import {
  CARE_RESULT_LABELS,
  CARE_SOURCE_LABELS,
  CARE_STATUS,
  CARE_STATUS_LABELS,
  CareResult,
  CareStatus,
  Student,
} from '../../models/types';

type Tab = 'open' | CareStatus;
type DetailTab = 'process' | 'details' | 'calls' | 'notes' | 'documents';

const NOTE_KIND_LABELS: Record<CareNote['kind'], string> = {
  trao_doi: 'Trao đổi',
  kho_khan: 'Báo khó khăn',
  chi_dao: 'Chỉ đạo',
  su_kien: 'Cập nhật',
  cuoc_goi: 'Cuộc gọi',
};

/**
 * Hồ sơ chăm sóc sinh viên: the list (by status) and the open case with its steps, findings,
 * calls, the exchange between staff and managers, and closing.
 */
@Component({
  selector: 'app-care',
  standalone: true,
  imports: [CommonModule, FormsModule, CareIconComponent, CareHeaderComponent, CareListComponent],
  templateUrl: './care.component.html',
  styleUrl: './care.component.css',
})
export class CareComponent implements OnInit, OnDestroy {
  private readonly careService = inject(CareCaseService);
  private readonly auth = inject(AuthService);
  private readonly ai = inject(AiService);
  private readonly calls = inject(CallService);
  private readonly notify = inject(NotificationService);
  private readonly students = inject(StudentService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly statusLabels = CARE_STATUS_LABELS;
  readonly sourceLabels = CARE_SOURCE_LABELS;
  readonly resultOptions = Object.entries(CARE_RESULT_LABELS) as [CareResult, string][];
  readonly noteKindLabels = NOTE_KIND_LABELS;
  readonly outcomeLabels = CALL_OUTCOME_LABELS as Record<string, string>;
  readonly STATUS = CARE_STATUS;

  readonly isManager = computed(() => this.auth.can('care.manage'));
  readonly canWorkRole = computed(() => this.auth.can('care.work'));
  /** Managers other than the admin act on cases; the admin only reads. */
  readonly canAct = computed(() => this.isManager() && !this.auth.isAdmin());
  /** Opening a case from here needs the student list. */
  readonly canViewStudents = computed(() => this.auth.can('students.view'));

  readonly tabs = computed<{ id: Tab; label: string }[]>(() =>
    this.isManager()
      ? [
          { id: 'cho_chi_dao', label: 'Chờ chỉ đạo' },
          { id: 'dang_cham_soc', label: 'Đang chăm sóc' },
          { id: 'cho_duyet_ket_thuc', label: 'Chờ duyệt kết thúc' },
          { id: 'da_ket_thuc', label: 'Lịch sử' },
        ]
      : [
          { id: 'open', label: this.canWorkRole() ? 'Đang phụ trách' : 'Đang mở' },
          { id: 'da_ket_thuc', label: 'Lịch sử' },
        ],
  );
  readonly tab = signal<Tab>('open');
  readonly search = signal('');
  readonly items = signal<CareCaseSummary[]>([]);
  readonly counts = signal<Partial<Record<CareStatus, number>>>({});
  readonly loading = signal(false);

  readonly selected = signal<CareCase | null>(null);
  readonly listCollapsed = signal(false);
  readonly detailLoading = signal(false);
  readonly busy = signal(false);

  // Presentation state only; all mutations still use the existing case actions.
  readonly detailTab = signal<DetailTab>('process');
  readonly editingFindings = signal(false);
  readonly pendingSuggestion = signal<string | null>(null);
  readonly detailTabs: { id: DetailTab; label: string; icon: CareIcon }[] = [
    { id: 'process', label: 'Quy trình chăm sóc', icon: 'steps' },
    { id: 'details', label: 'Thông tin chi tiết', icon: 'person' },
    { id: 'calls', label: 'Cuộc gọi', icon: 'phone' },
    { id: 'notes', label: 'Ghi chú', icon: 'note' },
    { id: 'documents', label: 'Tài liệu', icon: 'file' },
  ];

  changeDetailTab(tab: DetailTab) {
    this.detailTab.set(tab);
  }

  onDetailTabKey(event: KeyboardEvent, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % this.detailTabs.length;
    else if (event.key === 'ArrowLeft')
      next = (index + this.detailTabs.length - 1) % this.detailTabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = this.detailTabs.length - 1;
    else return;
    event.preventDefault();
    this.changeDetailTab(this.detailTabs[next].id);
    const buttons = (
      event.currentTarget as HTMLElement
    ).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
  }

  editFindings(field?: HTMLTextAreaElement) {
    this.detailTab.set('process');
    this.editingFindings.set(true);
    if (field) requestAnimationFrame(() => field.focus());
  }

  stepDescription(step: CareStep): string {
    if (step.source !== 'mac_dinh') return '';
    const descriptions: Record<string, string> = {
      'Liên hệ sinh viên / phụ huynh': 'Gọi điện, nhắn tin, xác nhận tình trạng.',
      'Tìm hiểu nguyên nhân': 'Khai thác lý do, hoàn cảnh, thu thập thông tin.',
      'Đưa ra hướng giải quyết': 'Đề xuất biện pháp, phối hợp phòng ban.',
      'Theo dõi chuyển biến sau chăm sóc': 'Cập nhật kết quả, đánh giá hiệu quả.',
    };
    return descriptions[step.title] || '';
  }

  // Direct form
  readonly staffOptions = signal<CareStaffOption[]>([]);
  directStaffId = '';
  directive = '';
  dueDate = '';
  // Step / findings / exchange / closing forms
  newStep = '';
  readonly aiSuggestions = signal<string[] | null>(null);
  readonly aiLoading = signal(false);
  cause = '';
  solution = '';
  noteKind: 'trao_doi' | 'kho_khan' | 'chi_dao' = 'trao_doi';
  noteText = '';
  closeResult: CareResult | '' = '';
  closeSummary = '';
  closeEarly = false;
  returnNote = '';
  readonly advice = signal<{ loading: boolean; text?: string; error?: string } | null>(null);
  readonly playing = signal<Record<string, string>>({});

  // New case (manager) / proposal
  readonly showNew = signal(false);
  studentQuery = '';
  readonly studentResults = signal<Student[]>([]);
  newStudent: Student | null = null;
  newReason = '';
  newStaffId = '';
  newDirective = '';

  readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    return q
      ? this.items().filter((c) =>
          [c.studentId?.fullName, c.studentId?.studentCode, c.studentId?.classCode]
            .join(' ')
            .toLowerCase()
            .includes(q),
        )
      : this.items();
  });

  readonly listTabs = computed(() =>
    this.tabs().map((t) => ({ ...t, count: this.countFor(t.id) })),
  );
  readonly overdueCaseIds = computed(
    () =>
      new Set(
        this.visible()
          .filter((c) => this.isOverdue(c))
          .map((c) => c._id),
      ),
  );

  private sub?: Subscription;
  private savedVersion = 0;

  constructor() {
    // A call saved from the dialog shows up in the open case right away.
    effect(() => {
      const version = this.calls.savedVersion();
      if (version !== this.savedVersion) {
        this.savedVersion = version;
        const id = this.selected()?._id;
        if (id) this.openCase(id, false);
      }
    });
  }

  ngOnInit() {
    this.tab.set(this.isManager() ? 'cho_chi_dao' : 'open');
    this.loadList();
    if (this.isManager())
      this.careService.staff().subscribe((s) => {
        this.staffOptions.set(s);
        const c = this.selected();
        if (c && !this.directStaffId) this.directStaffId = this.suggestedStaff(c)?._id ?? '';
      });
    this.sub = this.route.queryParamMap.subscribe((params) => {
      const id = params.get('case');
      if (id && id !== this.selected()?._id) this.openCase(id);
      if (!id) this.selected.set(null);
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.stopAudio();
  }

  // ---------------- List ----------------

  setTab(tab: Tab) {
    this.tab.set(tab);
    this.loadList();
  }

  loadList() {
    this.loading.set(true);
    this.careService.list({ status: this.tab() }).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.notify.error(err.error?.message || 'Không tải được danh sách hồ sơ');
      },
    });
    this.careService.summary().subscribe((s) => this.counts.set(s.counts));
  }

  countFor(tab: Tab): number | null {
    const c = this.counts();
    if (tab === 'open')
      return (c.cho_chi_dao ?? 0) + (c.dang_cham_soc ?? 0) + (c.cho_duyet_ket_thuc ?? 0);
    return tab === 'da_ket_thuc' ? null : (c[tab] ?? 0);
  }

  select(item: CareCaseSummary) {
    this.router.navigate([], { queryParams: { case: item._id }, queryParamsHandling: 'merge' });
  }

  closeDetail() {
    this.router.navigate([], { queryParams: { case: null }, queryParamsHandling: 'merge' });
  }

  progress(done: number, total: number): number {
    return total ? Math.round((done / total) * 100) : 0;
  }

  isOverdue(c: { dueDate: string | null; status: CareStatus }): boolean {
    return !!c.dueDate && c.status === CARE_STATUS.IN_PROGRESS && new Date(c.dueDate) < new Date();
  }

  // ---------------- Detail ----------------

  openCase(id: string, showLoading = true) {
    if (showLoading) this.detailLoading.set(true);
    this.careService.get(id).subscribe({
      next: (c) => this.show(c),
      error: (err) => {
        this.detailLoading.set(false);
        this.notify.error(err.error?.message || 'Không mở được hồ sơ');
        this.closeDetail();
      },
    });
  }

  private show(c: CareCase) {
    const switched = this.selected()?._id !== c._id;
    this.selected.set(c);
    this.detailLoading.set(false);
    this.busy.set(false);
    this.cause = c.cause;
    this.solution = c.solution;
    if (switched) {
      this.detailTab.set('process');
      this.editingFindings.set(false);
      this.pendingSuggestion.set(null);
      this.directStaffId = c.assignedStaffId?._id ?? this.suggestedStaff(c)?._id ?? '';
      this.directive = '';
      this.dueDate = c.dueDate ? c.dueDate.slice(0, 10) : '';
      this.aiSuggestions.set(null);
      this.advice.set(null);
      this.noteText = '';
      this.closeResult = '';
      this.closeSummary = '';
      this.closeEarly = false;
      this.returnNote = '';
      this.stopAudio();
    }
  }

  /** The staff member responsible for the student's class, as the default choice. */
  suggestedStaff(c: CareCase | null): CareStaffOption | undefined {
    const code = c?.studentId?.classCode?.toUpperCase();
    return this.staffOptions().find((s) => code && s.managedClasses.includes(code));
  }

  doneCount(c: CareCase): number {
    return c.steps.filter((s) => s.done).length;
  }

  resultLabel(result: CareResult | ''): string {
    return result ? CARE_RESULT_LABELS[result] : '';
  }

  sortedNotes(c: CareCase): CareNote[] {
    return [...c.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Runs a case action, then shows the updated case and refreshes the list. */
  private act(request: ReturnType<CareCaseService['get']>, message?: string) {
    this.busy.set(true);
    request.subscribe({
      next: (c) => {
        this.show(c);
        if (message) this.notify.success(message);
        this.loadList();
      },
      error: (err) => {
        this.busy.set(false);
        this.notify.error(err.error?.message || 'Thao tác không thành công');
      },
    });
  }

  direct(c: CareCase) {
    if (!this.directStaffId) return this.notify.error('Chọn nhân viên chăm sóc');
    this.act(
      this.careService.direct(c._id, {
        assignedStaffId: this.directStaffId,
        directive: this.directive.trim(),
        dueDate: this.dueDate || null,
      }),
      'Đã gửi chỉ đạo',
    );
    this.directive = '';
  }

  toggleStep(c: CareCase, step: CareStep) {
    this.act(this.careService.updateStep(c._id, step._id, { done: !step.done }));
  }

  saveStepNote(c: CareCase, step: CareStep, note: string) {
    if (note.trim() === step.note) return;
    this.act(this.careService.updateStep(c._id, step._id, { note: note.trim() }));
  }

  removeStep(c: CareCase, step: CareStep) {
    if (!confirm(`Xóa bước "${step.title}"?`)) return;
    this.act(this.careService.removeStep(c._id, step._id));
  }

  addStep(c: CareCase, title = this.newStep, source?: 'ai') {
    if (!title.trim()) return;
    this.act(this.careService.addStep(c._id, title.trim(), source));
    if (source === 'ai')
      this.aiSuggestions.update((list) => list?.filter((t) => t !== title) ?? null);
    else this.newStep = '';
  }

  suggestSteps(c: CareCase) {
    this.aiLoading.set(true);
    this.careService.aiSteps(c._id).subscribe({
      next: (res) => {
        this.aiLoading.set(false);
        this.aiSuggestions.set(res.steps);
        if (!res.steps.length) this.notify.error('AI chưa đưa ra được gợi ý, thử lại sau');
      },
      error: (err) => {
        this.aiLoading.set(false);
        this.notify.error(err.error?.message || 'AI Care chưa sẵn sàng');
      },
    });
  }

  saveFindings(c: CareCase) {
    this.act(
      this.careService.findings(c._id, { cause: this.cause, solution: this.solution }),
      'Đã lưu nguyên nhân & hướng giải quyết',
    );
  }

  sendNote(c: CareCase) {
    if (!this.noteText.trim()) return;
    this.act(this.careService.note(c._id, this.noteKind, this.noteText.trim()));
    this.noteText = '';
  }

  requestClose(c: CareCase) {
    if (!this.closeResult || !this.closeSummary.trim())
      return this.notify.error('Chọn kết quả và viết báo cáo chăm sóc');
    this.act(
      this.careService.requestClose(c._id, {
        result: this.closeResult,
        summary: this.closeSummary.trim(),
        early: this.closeEarly,
      }),
      'Đã gửi đề nghị kết thúc hồ sơ',
    );
  }

  approveClose(c: CareCase) {
    this.act(this.careService.close(c._id, { approve: true }), 'Đã duyệt kết thúc hồ sơ');
  }

  returnCase(c: CareCase) {
    if (!this.returnNote.trim()) return this.notify.error('Nhập lý do chưa duyệt');
    this.act(this.careService.close(c._id, { approve: false, note: this.returnNote.trim() }));
    this.returnNote = '';
  }

  closeDirectly(c: CareCase) {
    if (!this.closeResult || !this.closeSummary.trim())
      return this.notify.error('Chọn kết quả và viết đánh giá');
    if (!confirm('Kết thúc hồ sơ và chuyển vào lịch sử?')) return;
    this.act(
      this.careService.close(c._id, {
        result: this.closeResult,
        summary: this.closeSummary.trim(),
        early: this.closeEarly,
      }),
      'Đã kết thúc hồ sơ',
    );
  }

  // ---------------- Calls ----------------

  call(c: CareCase, target: CallTarget) {
    this.calls.open({ student: c.studentId, target, careCaseId: c._id });
  }

  getAdvice(c: CareCase) {
    this.advice.set({ loading: true });
    this.ai.getCallAdvice(c._id).subscribe({
      next: (res) => this.advice.set({ loading: false, text: res.advice }),
      error: (err) =>
        this.advice.set({ loading: false, error: err.error?.message || 'AI Care chưa sẵn sàng' }),
    });
  }

  play(callId: string) {
    if (this.playing()[callId]) return;
    this.calls.recording(callId).subscribe({
      next: (blob) =>
        this.playing.update((map) => ({ ...map, [callId]: URL.createObjectURL(blob) })),
      error: () => this.notify.error('Chưa có bản ghi âm cho cuộc gọi này'),
    });
  }

  private stopAudio() {
    for (const url of Object.values(this.playing())) URL.revokeObjectURL(url);
    this.playing.set({});
  }

  // ---------------- New case / proposal ----------------

  openNew() {
    this.showNew.set(true);
    this.studentQuery = '';
    this.studentResults.set([]);
    this.newStudent = null;
    this.newReason = '';
    this.newStaffId = '';
    this.newDirective = '';
  }

  findStudents() {
    const q = this.studentQuery.trim();
    if (q.length < 2) return this.studentResults.set([]);
    this.students.list({ search: q, limit: 8 }).subscribe({
      next: (res) => this.studentResults.set(res.items),
      error: () => this.studentResults.set([]),
    });
  }

  pickStudent(s: Student) {
    this.newStudent = s;
    this.studentResults.set([]);
    this.studentQuery = `${s.studentCode} · ${s.fullName}`;
    const owner = this.staffOptions().find((o) =>
      o.managedClasses.includes(s.classCode?.toUpperCase()),
    );
    this.newStaffId = owner?._id ?? '';
  }

  createCase() {
    if (!this.newStudent || !this.newReason.trim())
      return this.notify.error('Chọn sinh viên và nhập lý do');
    this.busy.set(true);
    this.careService
      .create({
        studentId: this.newStudent._id,
        reason: this.newReason.trim(),
        assignedStaffId: this.newStaffId || undefined,
        directive: this.newDirective.trim() || undefined,
      })
      .subscribe({
        next: (c) => {
          this.busy.set(false);
          this.showNew.set(false);
          this.notify.success('Đã mở hồ sơ chăm sóc');
          this.loadList();
          this.router.navigate([], { queryParams: { case: c._id } });
        },
        error: (err) => {
          this.busy.set(false);
          if (err.status === 409 && err.error?.caseId) {
            this.showNew.set(false);
            this.notify.error('Sinh viên đã có hồ sơ đang mở — đã mở hồ sơ đó');
            this.router.navigate([], { queryParams: { case: err.error.caseId } });
          } else this.notify.error(err.error?.message || 'Không mở được hồ sơ');
        },
      });
  }
}
