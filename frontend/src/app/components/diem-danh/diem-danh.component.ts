import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  AttendanceService,
  AttendanceHistoryItem,
  AttendanceSummary,
  SubmitAttendanceResult,
  ScheduleSession,
  ScheduleData,
} from '../../services/attendance.service';
import { AuthService } from '../../services/auth.service';
import { CareCaseService } from '../../services/care-case.service';
import { StaffService } from '../../services/staff.service';
import { NotificationService } from '../../services/notification.service';
import { CallService, CallTarget } from '../../services/call.service';
import {
  CourseGroup,
  Student,
  WEEKDAYS_BY_JS_DAY,
  AttendanceWindow,
  WarningLevel,
} from '../../models/types';
import { ViLabelPipe, viLabel } from '../../utils/label.pipe';

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule, ViLabelPipe, RouterLink],
  templateUrl: './diem-danh.component.html',
  styleUrl: './diem-danh.component.css',
})
export class AttendanceComponent implements OnInit, OnDestroy {
  activeTab: 'home' | 'attendance' | 'calls' | 'profile' = 'attendance';
  showLookupModal = false;
  lookupTerm = '';
  lookupResult: Student | null = null;
  lookupSearched = false;

  showPasswordModal = false;
  newPasswordInput = '';
  passwordChangedMsg = '';

  courseGroups: CourseGroup[] = [];
  filterShift = '';
  selectedGroupId = '';
  selectedGroup: CourseGroup | null = null;

  /** Open care cases the user proposed or is working on (home card and tab badge). */
  myOpenCases = 0;
  get canOpenCare(): boolean {
    return this.authService.canOpen('/care');
  }
  get canProposeCare(): boolean {
    return this.authService.can('care.propose') || this.authService.can('care.manage');
  }

  attendanceMode: 'new' | 'history' | 'summary' = 'history';
  activeSession: ScheduleSession | null = null;

  // Absent student map: { [studentId]: boolean }
  historyList: AttendanceHistoryItem[] = [];
  scheduleData: ScheduleData | null = null; // tất cả buổi theo lịch
  attendanceSummary: AttendanceSummary | null = null;
  isLoadingSummary = false;
  submitResult: SubmitAttendanceResult | null = null;

  // ─── Lock state: kiểm tra buổi hôm nay đã điểm danh chưa ───

  /** Whether attendance can be written now (timetable window, or the manager's override). */
  attendanceWindow: AttendanceWindow | null = null;

  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(
    private attendanceService: AttendanceService,
    public authService: AuthService,
    private careCases: CareCaseService,
    private staffService: StaffService,
    private notify: NotificationService,
    private cdr: ChangeDetectorRef,
    private calls: CallService,
  ) {}

  /** Every "Gọi" link goes through the app's call dialog, so the call is logged (and can be recorded). */
  callStudent(
    event: Event,
    student:
      | {
          _id: string;
          fullName: string;
          studentCode?: string;
          phone?: string;
          parentPhone?: string;
        }
      | null
      | undefined,
    target: CallTarget,
    context: { courseGroupId?: string } = {},
  ) {
    event.preventDefault();
    if (student?._id) this.calls.open({ student, target, ...context });
  }

  ngOnInit(): void {
    this.loadCourseGroups();
    this.loadMyCases();
    this.pollTimer = setInterval(() => {
      if (!document.hidden) this.loadMyCases();
    }, 60000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  get currentUser() {
    return this.authService.currentUser();
  }

  get todayName(): string {
    return viLabel(WEEKDAYS_BY_JS_DAY[new Date().getDay()]);
  }

  get todayDateStr(): string {
    return new Date().toLocaleDateString('vi-VN');
  }

  get myAssignedGroups(): CourseGroup[] {
    return this.courseGroups.filter((g) => this.isAssignedTeacher(g));
  }

  get todayClasses(): CourseGroup[] {
    const today = WEEKDAYS_BY_JS_DAY[new Date().getDay()];
    return this.myAssignedGroups.filter((g) => g.scheduleDays && g.scheduleDays.includes(today));
  }

  get totalAssignedStudents(): number {
    return this.myAssignedGroups.reduce((acc, g) => acc + (g.students?.length || 0), 0);
  }

  get filteredCourseGroups(): CourseGroup[] {
    if (!this.filterShift) return this.courseGroups;
    return this.courseGroups.filter((g) => g.shift === this.filterShift);
  }

  isAssignedTeacher(group: CourseGroup | null): boolean {
    if (!group) return false;
    if (this.currentUser?.role === 'admin') return true;
    const userId = this.currentUser?.id || this.currentUser?._id || '';
    const userFullName = (this.currentUser?.fullName || '').trim();

    let groupTeacherId = '';
    if (group.teacherId) {
      groupTeacherId =
        typeof group.teacherId === 'string'
          ? group.teacherId
          : group.teacherId._id || group.teacherId.id || '';
    }

    const groupTeacherName = (group.teacherName || '').trim();

    return (
      (groupTeacherId !== '' && groupTeacherId === userId) ||
      (groupTeacherName !== '' && groupTeacherName === userFullName)
    );
  }

  /** Class picker search (code, course name, teacher). */
  courseSearch = '';

  get displayCourseGroups(): CourseGroup[] {
    const term = this.courseSearch.trim().toLowerCase();
    if (!term) return this.filteredCourseGroups;
    return this.filteredCourseGroups.filter((g) =>
      [g.groupCode, g.courseName, g.teacherName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }

  /** Read-only book: only the group's lecturer writes, and only during class hours. */
  get readOnly(): boolean {
    return !this.attendanceWindow?.canWrite;
  }

  // ---- Attendance book filters ----
  matrixSearch = '';
  matrixStatus: 'all' | 'absent' | 'warning' | 'full' = 'all';
  matrixSessions: 'all' | 'past' | 'recent' = 'past';

  /** Students shown in the book after the search and status filters. */
  get matrixStudents(): Student[] {
    const term = this.matrixSearch.trim().toLowerCase();
    return (this.selectedGroup?.students ?? []).filter((s) => {
      if (term && !`${s.studentCode} ${s.fullName}`.toLowerCase().includes(term)) return false;
      const absent = this.getTotalAbsentForStudent(s._id);
      if (this.matrixStatus === 'absent') return absent + this.getTotalExcusedForStudent(s._id) > 0;
      if (this.matrixStatus === 'warning') return Boolean(this.warningFor(s._id));
      if (this.matrixStatus === 'full')
        return absent === 0 && this.getTotalExcusedForStudent(s._id) === 0;
      return true;
    });
  }

  /** Session columns: every session, only held ones, or the last 5 held. */
  get visibleSessions(): ScheduleSession[] {
    const all = this.allSessions;
    if (this.matrixSessions === 'all') return all;
    const held = all.filter((s) => s.status !== 'future');
    const list = this.matrixSessions === 'recent' ? held.slice(-5) : held;
    // Nothing held yet: still show the upcoming sessions rather than an empty book.
    return list.length ? list : all;
  }

  resetMatrixFilters() {
    this.matrixSearch = '';
    this.matrixStatus = 'all';
    this.matrixSessions = 'past';
  }

  readonly matrixStatusOptions: { id: AttendanceComponent['matrixStatus']; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'absent', label: 'Có vắng' },
    { id: 'warning', label: 'Chạm cảnh báo' },
    { id: 'full', label: 'Đủ buổi' },
  ];

  readonly sessionStateLabel = {
    dirty: 'Chưa lưu',
    saved: 'Đã lưu',
    final: 'Đã chốt',
    missing: 'Không ghi',
    future: 'Sắp tới',
  } as const;

  sessionState(session: ScheduleSession): keyof AttendanceComponent['sessionStateLabel'] {
    if (this.isSessionDirty(session)) return 'dirty';
    if (session.status === 'future') return 'future';
    if (session.status === 'recorded') return this.isSessionLocked(session) ? 'final' : 'saved';
    return 'missing';
  }

  readonly cellMark = { present: '✓', absent: 'V', excused: 'P', missing: '–', future: '·' };

  /** What one cell shows; a past session nobody recorded shows "–" rather than "present". */
  cellStatus(studentId: string, session: ScheduleSession): keyof AttendanceComponent['cellMark'] {
    if (session.status === 'future') return 'future';
    if (
      session.status === 'missing' &&
      this.isSessionLocked(session) &&
      !this.isSessionDirty(session)
    )
      return 'missing';
    return this.getStudentStatusInMatrix(studentId, session);
  }

  cellTitle(studentId: string, session: ScheduleSession): string {
    const status = this.cellStatus(studentId, session);
    if (status === 'missing') return 'Buổi này không được điểm danh';
    if (status === 'present') return 'Có mặt';
    if (status === 'absent') return 'Vắng không phép';
    return (
      'Vắng có phép: ' + (this.getStudentExcusedReason(studentId, session) || 'Có đơn xin phép')
    );
  }

  /** Right-click on an excused cell edits its reason (editable sessions only). */
  onCellContextMenu(event: Event, studentId: string, name: string, session: ScheduleSession) {
    event.preventDefault();
    if (
      !this.isSessionLocked(session) &&
      this.getStudentStatusInMatrix(studentId, session) === 'excused'
    )
      this.openExcusedModal(studentId, name, session);
  }

  loadCourseGroups() {
    this.attendanceService.getCourseGroups().subscribe({
      next: (groups) => {
        this.courseGroups = groups;
        if (groups.length > 0) {
          if (!this.selectedGroupId) {
            this.selectedGroupId = groups[0]._id;
            this.onGroupChange();
          }
        } else {
          this.selectedGroupId = '';
          this.selectedGroup = null;
        }
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Load groups error:', err),
    });
  }

  selectCourseGroup(id: string) {
    this.selectedGroupId = id;
    this.onGroupChange();
  }

  goToAttendanceForGroup(id: string) {
    this.selectedGroupId = id;
    this.activeTab = 'attendance';
    this.attendanceMode = 'history';
    this.onGroupChange();
    this.cdr.detectChanges();
  }

  onGroupChange() {
    this.selectedGroup = this.courseGroups.find((g) => g._id === this.selectedGroupId) || null;
    this.attendanceSummary = null;
    this.activeSession = null;

    this.attendanceWindow = null;
    this.loadWindow();
    this.loadHistory();
    if (!this.attendanceSummary) this.loadAttendanceSummary();
  }

  loadWindow() {
    if (!this.selectedGroupId) return;
    this.attendanceService.getWindow(this.selectedGroupId).subscribe({
      next: (w) => {
        this.attendanceWindow = w;
        this.cdr.detectChanges();
      },
      error: () => (this.attendanceWindow = null),
    });
  }

  get periodsPerSession(): number {
    return this.attendanceSummary?.periodsPerSession || 4;
  }

  /** Highest configured warning level the student reached (periods / % of total periods). */
  warningFor(studentId: string): WarningLevel | null {
    const summary = this.attendanceSummary;
    if (!summary?.warningLevels?.length) return null;
    const periods = this.getTotalAbsentForStudent(studentId) * this.periodsPerSession;
    const percent = summary.totalPeriods ? (periods / summary.totalPeriods) * 100 : null;
    let reached: WarningLevel | null = null;
    for (const level of summary.warningLevels) {
      const value = level.unit === 'percent' ? percent : periods;
      if (value !== null && value >= level.threshold) reached = level;
    }
    return reached;
  }

  switchAttendanceMode(mode: 'new' | 'history' | 'summary') {
    this.attendanceMode = mode === 'new' ? 'history' : mode;
    if (this.attendanceMode === 'history') {
      this.loadHistory();
      if (!this.attendanceSummary) this.loadAttendanceSummary();
    } else if (this.attendanceMode === 'summary') {
      this.loadAttendanceSummary();
    }
  }

  loadHistory() {
    if (!this.selectedGroupId) return;
    this.attendanceService.getAttendanceHistory(this.selectedGroupId).subscribe({
      next: (list) => {
        this.historyList = list;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Load history error:', err),
    });
    // Load full schedule (all sessions per timetable)
    this.loadScheduleSessions();
  }

  loadScheduleSessions() {
    if (!this.selectedGroupId) return;
    this.attendanceService.getScheduleSessions(this.selectedGroupId).subscribe({
      next: (data) => {
        this.scheduleData = data;
        this.autoSelectActiveSession();
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Load schedule error:', err),
    });
  }

  isTodaySession(session: ScheduleSession | null): boolean {
    if (!session?.scheduledDate) return false;
    const d = new Date(session.scheduledDate);
    const today = new Date();
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  }

  setActiveSession(session: ScheduleSession): void {
    this.activeSession = session;
    this.initSessionDraft(session);
    this.cdr.detectChanges();
  }

  autoSelectActiveSession(): void {
    const sessions = this.allSessions;
    if (!sessions.length) {
      this.activeSession = null;
      return;
    }
    const todaySession = sessions.find((s) => this.isTodaySession(s));
    if (todaySession) {
      this.activeSession = todaySession;
    } else {
      const missingSession = sessions.find((s) => s.status === 'missing');
      this.activeSession = missingSession || sessions[sessions.length - 1];
    }
    if (this.activeSession) {
      this.initSessionDraft(this.activeSession);
    }
  }

  loadAttendanceSummary() {
    if (!this.selectedGroupId) return;
    this.isLoadingSummary = true;
    this.attendanceSummary = null;
    this.attendanceService.getAttendanceSummary(this.selectedGroupId).subscribe({
      next: (data) => {
        this.attendanceSummary = data;
        this.isLoadingSummary = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoadingSummary = false;
        console.error('Load summary error:', err);
        this.cdr.detectChanges();
      },
    });
  }

  async deleteHistoryRecord(attendanceId: string) {
    const ok = await this.notify.confirm({
      title: 'Xóa bản ghi điểm danh?',
      message: 'Bản ghi điểm danh của buổi này sẽ bị xóa. Hồ sơ chăm sóc đã mở vẫn được giữ.',
      confirmText: 'Xóa',
      danger: true,
    });
    if (!ok) return;
    this.attendanceService.deleteAttendanceRecord(attendanceId).subscribe({
      next: () => {
        this.historyList = this.historyList.filter((h) => h._id !== attendanceId);
        this.notify.success('Đã xóa bản ghi điểm danh');
        this.cdr.detectChanges();
      },
      error: (err) => this.notify.error(err.error?.message || err.message, 'Lỗi khi xóa'),
    });
  }

  loadMyCases() {
    if (!this.canOpenCare) return;
    this.careCases.list({ status: 'open', mine: true }).subscribe({
      next: (res) => {
        this.myOpenCases = res.items.length;
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  /** Lecturer / staff proposes a care case for a student who seems to be dropping out. */
  proposeCare(student: { _id: string; fullName: string }) {
    const reason = prompt(
      `Lý do đề xuất chăm sóc ${student.fullName}:`,
      'Nghỉ học nhiều, có dấu hiệu bỏ học',
    );
    if (!reason?.trim()) return;
    this.careCases.create({ studentId: student._id, reason: reason.trim() }).subscribe({
      next: () => {
        this.notify.success('Đã gửi đề xuất chăm sóc tới Trưởng phòng / Phó hiệu trưởng');
        this.loadMyCases();
        this.loadAttendanceSummary();
      },
      error: (err) =>
        this.notify.error(
          err.status === 409
            ? 'Sinh viên đã có hồ sơ chăm sóc đang mở'
            : err.error?.message || 'Không gửi được đề xuất',
        ),
    });
  }

  doStudentLookup() {
    this.lookupSearched = true;
    if (!this.lookupTerm.trim()) {
      this.lookupResult = null;
      return;
    }
    const term = this.lookupTerm.toLowerCase().trim();
    let found: Student | null = null;
    for (const g of this.courseGroups) {
      if (g.students) {
        const match = g.students.find(
          (s) =>
            s.studentCode.toLowerCase().includes(term) || s.fullName.toLowerCase().includes(term),
        );
        if (match) {
          found = match;
          break;
        }
      }
    }
    this.lookupResult = found;
    this.cdr.detectChanges();
  }

  saveMyNewPassword() {
    if (!this.newPasswordInput.trim()) {
      this.notify.warning('Vui lòng nhập mật khẩu mới');
      return;
    }
    const userId = this.currentUser?.id || this.currentUser?._id || '';
    this.staffService.updateStaff(userId, { password: this.newPasswordInput.trim() }).subscribe({
      next: () => {
        this.passwordChangedMsg = '✅ Đã đổi mật khẩu thành công!';
        setTimeout(() => {
          this.passwordChangedMsg = '';
          this.showPasswordModal = false;
          this.newPasswordInput = '';
        }, 2000);
        this.cdr.detectChanges();
      },
      error: (err) => this.notify.error(err.error?.message || err.message, 'Lỗi khi đổi mật khẩu'),
    });
  }

  // ─── Helpers cho bảng ma trận điểm danh ───

  // Draft Map cho điểm danh ma trận tích chọn: { [sessionKey]: Set<studentId> }
  matrixDraft: { [sessionKey: string]: { absent: Set<string>; excused: Map<string, string> } } = {};
  dirtySessions = new Set<string>();
  savingSessionKey: string | null = null;

  showExcusedModal = false;
  excusedTarget: { studentId: string; studentName: string; session: ScheduleSession } | null = null;
  excusedReasonInput = '';
  quickExcusedReasons = [
    'Bệnh / Sốt',
    'Việc gia đình',
    'Thi học phần khác',
    'Có đơn xin phép',
    'Đi làm công tác trường',
  ];

  getSessionKey(session: ScheduleSession): string {
    if (!session?.scheduledDate) return '';
    const d = new Date(session.scheduledDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Tải trạng thái ban đầu của buổi học vào Draft */
  initSessionDraft(session: ScheduleSession): void {
    const key = this.getSessionKey(session);
    if (!key || this.matrixDraft[key]) return;

    const absentSet = new Set<string>();
    const excusedMap = new Map<string, string>();

    if (session.status === 'recorded' && session.attendance) {
      if (session.attendance.absentStudents) {
        for (const st of session.attendance.absentStudents) {
          const id = typeof st === 'object' ? st._id : st;
          if (id) absentSet.add(id);
        }
      }
      if (session.attendance.excusedStudents) {
        for (const item of session.attendance.excusedStudents) {
          const id = typeof item.studentId === 'object' ? item.studentId._id : item.studentId;
          if (id) excusedMap.set(id, item.reason || 'Có phép');
        }
      }
    }
    this.matrixDraft[key] = { absent: absentSet, excused: excusedMap };
  }

  /**
   * Whether a session is closed for editing. Only the lecturer writes, only today's session and
   * only during class hours (the server decides the window); once the class ends it is final.
   */
  isSessionLocked(session: ScheduleSession): boolean {
    if (!session) return false;
    if (session.status === 'future' || this.readOnly || !this.attendanceWindow?.open) return true;
    const today = this.getSessionKey({
      scheduledDate: new Date().toISOString(),
    } as ScheduleSession);
    return this.getSessionKey(session) !== today;
  }

  /** Lấy trạng thái của sinh viên trong ma trận: 'present' | 'absent' | 'excused' */
  getStudentStatusInMatrix(
    studentId: string,
    session: ScheduleSession,
  ): 'present' | 'absent' | 'excused' {
    const key = this.getSessionKey(session);
    if (this.matrixDraft[key]) {
      if (this.matrixDraft[key].absent.has(studentId)) return 'absent';
      if (this.matrixDraft[key].excused.has(studentId)) return 'excused';
      return 'present';
    }
    if (session.attendance) {
      const isAbsent = session.attendance.absentStudents?.some(
        (st) => (typeof st === 'object' ? st._id : st) === studentId,
      );
      if (isAbsent) return 'absent';
      const isExcused = session.attendance.excusedStudents?.some(
        (i) => (typeof i.studentId === 'object' ? i.studentId._id : i.studentId) === studentId,
      );
      if (isExcused) return 'excused';
    }
    return 'present';
  }

  /** Lấy lý do vắng có phép */
  getStudentExcusedReason(studentId: string, session: ScheduleSession): string {
    const key = this.getSessionKey(session);
    if (this.matrixDraft[key]) {
      return this.matrixDraft[key].excused.get(studentId) || '';
    }
    if (session.attendance?.excusedStudents) {
      const item = session.attendance.excusedStudents.find(
        (i) => (typeof i.studentId === 'object' ? i.studentId._id : i.studentId) === studentId,
      );
      return item?.reason || '';
    }
    return '';
  }

  /** Click ô sinh viên trong ma trận: Có mặt (✓) -> Vắng không phép (✕) -> Vắng có phép (P) -> Có mặt (✓) */
  toggleStudentInMatrix(studentId: string, session: ScheduleSession, studentName = ''): void {
    if (this.isSessionLocked(session)) {
      this.notify.warning(
        this.readOnly
          ? 'Bạn đang ở chế độ xem. Chỉ giảng viên của lớp điểm danh, trong giờ học.'
          : session.status === 'future'
            ? 'Buổi học này chưa diễn ra.'
            : `Buổi ngày ${new Date(session.scheduledDate).toLocaleDateString('vi-VN')} đã được chốt, không sửa được nữa.`,
        '🔒 Không thể điểm danh',
      );
      return;
    }

    const key = this.getSessionKey(session);
    if (!key) return;
    this.setActiveSession(session);
    this.initSessionDraft(session);

    const draft = this.matrixDraft[key];
    const current = this.getStudentStatusInMatrix(studentId, session);

    if (current === 'present') {
      // Có mặt -> Vắng không phép
      draft.absent.add(studentId);
      draft.excused.delete(studentId);
    } else if (current === 'absent') {
      // Vắng không phép -> Vắng có phép (mở modal nhập lý do)
      draft.absent.delete(studentId);
      draft.excused.set(studentId, 'Bệnh / Sốt');
      this.openExcusedModal(studentId, studentName, session);
    } else {
      // Vắng có phép -> Có mặt
      draft.absent.delete(studentId);
      draft.excused.delete(studentId);
    }

    this.dirtySessions.add(key);
    this.cdr.detectChanges();
  }

  /** Mở popup nhập lý do vắng có phép */
  openExcusedModal(studentId: string, studentName: string, session: ScheduleSession): void {
    this.excusedTarget = { studentId, studentName, session };
    this.excusedReasonInput = this.getStudentExcusedReason(studentId, session) || 'Bệnh / Sốt';
    this.showExcusedModal = true;
    this.cdr.detectChanges();
  }

  selectQuickReason(reason: string): void {
    this.excusedReasonInput = reason;
  }

  saveExcusedReason(): void {
    if (!this.excusedTarget) return;
    const { studentId, session } = this.excusedTarget;
    const key = this.getSessionKey(session);
    if (this.matrixDraft[key]) {
      this.matrixDraft[key].excused.set(
        studentId,
        this.excusedReasonInput.trim() || 'Có đơn xin phép',
      );
      this.dirtySessions.add(key);
    }
    this.showExcusedModal = false;
    this.excusedTarget = null;
    this.cdr.detectChanges();
  }

  cancelExcusedReason(): void {
    this.showExcusedModal = false;
    this.excusedTarget = null;
    this.cdr.detectChanges();
  }

  /** Đánh dấu tất cả CÓ MẶT cho buổi học này */
  markAllPresentInSession(session: ScheduleSession): void {
    const key = this.getSessionKey(session);
    if (!key) return;
    this.setActiveSession(session);
    this.matrixDraft[key] = { absent: new Set<string>(), excused: new Map<string, string>() };
    this.dirtySessions.add(key);
    this.cdr.detectChanges();
  }

  /** Đánh dấu tất cả VẮNG KHÔNG PHÉP cho buổi học này */
  markAllAbsentInSession(session: ScheduleSession): void {
    const key = this.getSessionKey(session);
    if (!key || !this.selectedGroup?.students) return;
    this.setActiveSession(session);
    this.matrixDraft[key] = {
      absent: new Set<string>(this.selectedGroup.students.map((s) => s._id)),
      excused: new Map<string, string>(),
    };
    this.dirtySessions.add(key);
    this.cdr.detectChanges();
  }

  /** Đánh dấu tất cả VẮNG CÓ PHÉP cho buổi học này */
  markAllExcusedInSession(session: ScheduleSession): void {
    const key = this.getSessionKey(session);
    if (!key || !this.selectedGroup?.students) return;
    this.setActiveSession(session);
    const excusedMap = new Map<string, string>();
    for (const s of this.selectedGroup.students) {
      excusedMap.set(s._id, 'Có đơn xin phép');
    }
    this.matrixDraft[key] = {
      absent: new Set<string>(),
      excused: excusedMap,
    };
    this.dirtySessions.add(key);
    this.cdr.detectChanges();
  }

  /** Kiểm tra buổi học có thay đổi chưa lưu hay không */
  isSessionDirty(session: ScheduleSession): boolean {
    const key = this.getSessionKey(session);
    return this.dirtySessions.has(key);
  }

  /** Đếm số SV vắng không phép trong cột ma trận */
  getAbsentCountForSession(session: ScheduleSession): number {
    const key = this.getSessionKey(session);
    if (this.matrixDraft[key]) {
      return this.matrixDraft[key].absent.size;
    }
    return session.attendance?.absentStudents?.length || 0;
  }

  /** Đếm số SV vắng có phép trong cột ma trận */
  getExcusedCountForSession(session: ScheduleSession): number {
    const key = this.getSessionKey(session);
    if (this.matrixDraft[key]) {
      return this.matrixDraft[key].excused.size;
    }
    return session.attendance?.excusedStudents?.length || 0;
  }

  /** Bấm "Lưu điểm danh buổi này" */
  submitMatrixSession(session: ScheduleSession): void {
    if (!this.selectedGroup) return;
    const key = this.getSessionKey(session);
    this.initSessionDraft(session);

    const draft = this.matrixDraft[key];
    const absentStudentIds = Array.from(draft.absent);
    const excusedStudents = Array.from(draft.excused.entries()).map(([studentId, reason]) => ({
      studentId,
      reason,
    }));

    this.savingSessionKey = key;
    this.cdr.detectChanges();

    this.attendanceService
      .submitAttendance({
        courseGroupId: this.selectedGroup._id,
        date: session.scheduledDate,
        absentStudentIds,
        excusedStudents,
      })
      .subscribe({
        next: (res) => {
          this.savingSessionKey = null;
          this.dirtySessions.delete(key);
          delete this.matrixDraft[key];
          this.submitResult = res;

          setTimeout(() => {
            if (this.submitResult === res) this.submitResult = null;
            this.cdr.detectChanges();
          }, 10000);

          this.loadHistory();
          this.loadAttendanceSummary();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.savingSessionKey = null;
          this.notify.error(err.error?.message || 'Không thể lưu điểm danh cho buổi này.');
          this.cdr.detectChanges();
        },
      });
  }

  /** Tất cả buổi lịch (recorded + missing + future), cũ → mới */
  get allSessions(): ScheduleSession[] {
    if (this.scheduleData?.sessions?.length) {
      return [...this.scheduleData.sessions].sort(
        (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
      );
    }
    return this.historyList.map((h) => ({
      scheduledDate: h.date,
      status: 'recorded' as const,
      attendance: h,
    }));
  }

  /** Số buổi đã điểm danh (chỉ recorded) */
  get recordedSessionsCount(): number {
    return this.allSessions.filter((s) => s.status === 'recorded').length;
  }

  /** Tổng số buổi vắng KHÔNG PHÉP của SV */
  getTotalAbsentForStudent(studentId: string): number {
    return this.allSessions.filter((s) => this.getStudentStatusInMatrix(studentId, s) === 'absent')
      .length;
  }

  /** Tổng số buổi vắng CÓ PHÉP của SV */
  getTotalExcusedForStudent(studentId: string): number {
    return this.allSessions.filter((s) => this.getStudentStatusInMatrix(studentId, s) === 'excused')
      .length;
  }

  /** Chuyển đổi ngày sang định dạng Tiếng Việt (Thứ 2, Thứ 3...) */
  formatVietnameseDay(dateInput: string | Date): string {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    return viLabel(WEEKDAYS_BY_JS_DAY[d.getDay()]);
  }
}
