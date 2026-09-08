import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import {
  AttendanceService,
  AttendanceHistoryItem,
  AttendanceSummary,
  StudentSummary,
  SubmitAttendanceResult,
  ScheduleSession,
  ScheduleData,
} from '../../services/attendance.service';
import { AuthService } from '../../services/auth.service';
import { CallTaskService } from '../../services/call-task.service';
import { StaffService } from '../../services/staff.service';
import { CourseGroup, Student, CallTask } from '../../models/types';

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './attendance.component.html',
})
export class AttendanceComponent implements OnInit, OnDestroy {
  activeTab: 'home' | 'attendance' | 'calls' | 'profile' = 'attendance';
  showQuickMenu = false;
  showLookupModal = false;
  lookupTerm = '';
  lookupResult: Student | null = null;
  lookupSearched = false;

  showPasswordModal = false;
  newPasswordInput = '';
  passwordChangedMsg = '';

  courseGroups: CourseGroup[] = [];
  filterShift = '';
  showAllCourses = false;
  selectedGroupId = '';
  selectedGroup: CourseGroup | null = null;
  searchTerm = '';

  // Call Tasks state
  myCallTasks: CallTask[] = [];
  taskFilterStatus = '';
  unreadCallsCount = 0;

  attendanceMode: 'new' | 'history' | 'summary' = 'history';
  activeSession: ScheduleSession | null = null;

  // Absent student map: { [studentId]: boolean }
  absentMap: { [studentId: string]: boolean } = {};
  historyList: AttendanceHistoryItem[] = [];
  scheduleData: ScheduleData | null = null; // tất cả buổi theo lịch
  attendanceSummary: AttendanceSummary | null = null;
  isLoadingSummary = false;
  submitResult: SubmitAttendanceResult | null = null;

  // ─── Lock state: kiểm tra buổi hôm nay đã điểm danh chưa ───
  todayRecord: AttendanceHistoryItem | null = null; // bản ghi hôm nay (nếu có)
  isCheckingToday = false; // đang check
  isAttendanceLocked = false; // true = đã lưu, khóa form

  isSubmitting = false;
  successMsg = '';
  allowFlexibleAttendance = false;

  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(
    private attendanceService: AttendanceService,
    public authService: AuthService,
    private callTaskService: CallTaskService,
    private staffService: StaffService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadCourseGroups();
    this.loadMyCallTasks();
    this.pollTimer = setInterval(() => this.loadMyCallTasks(), 15000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  get currentUser() {
    return this.authService.currentUser();
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  get todayName(): string {
    const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    return dayNames[new Date().getDay()];
  }

  get todayDateStr(): string {
    return new Date().toLocaleDateString('vi-VN');
  }

  get myAssignedGroups(): CourseGroup[] {
    return this.courseGroups.filter((g) => this.isAssignedTeacher(g));
  }

  get todayClasses(): CourseGroup[] {
    const tName = this.todayName;
    return this.myAssignedGroups.filter((g) => g.scheduleDays && g.scheduleDays.includes(tName));
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

  get displayCourseGroups(): CourseGroup[] {
    let list = this.filteredCourseGroups;
    if (!this.showAllCourses && this.currentUser?.role === 'staff') {
      list = list.filter((g) => this.isAssignedTeacher(g));
    }
    return list;
  }

  loadCourseGroups() {
    this.attendanceService.getCourseGroups(this.showAllCourses).subscribe({
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

  toggleShowAllCourses(showAll: boolean) {
    this.showAllCourses = showAll;
    this.loadCourseGroups();
  }

  onGroupChange() {
    this.selectedGroup = this.courseGroups.find((g) => g._id === this.selectedGroupId) || null;
    this.absentMap = {};
    this.attendanceSummary = null;
    this.todayRecord = null;
    this.isAttendanceLocked = false;
    this.activeSession = null;

    this.loadHistory();
    if (!this.attendanceSummary) this.loadAttendanceSummary();
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

  /** Kiểm tra buổi hôm nay đã điểm danh chưa, nếu rồi đưa vào trạng thái khóa */
  checkTodayAttendance() {
    if (!this.selectedGroupId) return;
    this.isCheckingToday = true;
    this.cdr.detectChanges();
    this.attendanceService.getTodayAttendance(this.selectedGroupId).subscribe({
      next: (record) => {
        this.todayRecord = record;
        if (record) {
          // Đã điểm danh hôm nay → khóa form, điền lại danh sách vắng cũ
          this.isAttendanceLocked = true;
          this.absentMap = {};
          for (const st of record.absentStudents || []) {
            this.absentMap[st._id] = true;
          }
        } else {
          // Chưa điểm danh → mở form mới
          this.isAttendanceLocked = false;
          this.absentMap = {};
        }
        this.isCheckingToday = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isCheckingToday = false;
        this.cdr.detectChanges();
      },
    });
  }

  /** Mở khóa để giảng viên sửa lại danh sách vắng của buổi hôm nay */
  unlockAttendance() {
    this.isAttendanceLocked = false;
    this.cdr.detectChanges();
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

  deleteHistoryRecord(attendanceId: string) {
    if (!confirm('Xóa bản ghi điểm danh này?')) return;
    this.attendanceService.deleteAttendanceRecord(attendanceId).subscribe({
      next: () => {
        this.historyList = this.historyList.filter((h) => h._id !== attendanceId);
        this.cdr.detectChanges();
      },
      error: (err) => alert('Lỗi khi xóa: ' + (err.error?.message || err.message)),
    });
  }

  loadMyCallTasks() {
    this.callTaskService.getMyTasks().subscribe({
      next: (tasks) => {
        this.myCallTasks = tasks;
        this.unreadCallsCount = tasks.filter((t) => t.status === 'Chưa gọi').length;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Load call tasks error:', err),
    });
  }

  get filteredCallTasks(): CallTask[] {
    if (!this.taskFilterStatus) return this.myCallTasks;
    return this.myCallTasks.filter((t) => t.status === this.taskFilterStatus);
  }

  updateTaskStatus(
    taskId: string,
    status: 'Chưa gọi' | 'Không bắt máy' | 'Đã liên hệ',
    note: string,
  ) {
    this.callTaskService.updateTaskStatus(taskId, { status, callNote: note || '' }).subscribe({
      next: (res) => {
        this.loadMyCallTasks();
        this.cdr.detectChanges();
      },
      error: (err) => alert('Lỗi khi cập nhật cuộc gọi: ' + (err.error?.message || err.message)),
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
      alert('Vui lòng nhập mật khẩu mới');
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
      error: (err) => alert('Lỗi khi đổi mật khẩu: ' + (err.error?.message || err.message)),
    });
  }

  getScheduleCheck(group: CourseGroup | null) {
    if (!group) {
      return { isValid: true, reason: '', badgeText: '', badgeClass: '' };
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // 1. Check Start & End Date
    if (group.startDate) {
      const startDtStr = new Date(group.startDate).toISOString().split('T')[0];
      if (todayStr < startDtStr) {
        const formattedStart = new Date(group.startDate).toLocaleDateString('vi-VN');
        return {
          isValid: false,
          reason: `⚠️ Chưa đến ngày bắt đầu học phần (Lớp bắt đầu từ ngày ${formattedStart})`,
          badgeText: `🔒 Bắt đầu từ ${formattedStart}`,
          badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
        };
      }
    }

    if (group.endDate) {
      const endDtStr = new Date(group.endDate).toISOString().split('T')[0];
      if (todayStr > endDtStr) {
        const formattedEnd = new Date(group.endDate).toLocaleDateString('vi-VN');
        return {
          isValid: false,
          reason: `⚠️ Học phần đã kết thúc khóa học (Đã kết thúc vào ngày ${formattedEnd})`,
          badgeText: `🔒 Đã kết thúc ngày ${formattedEnd}`,
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
        };
      }
    }

    // 2. Check Day of Week
    const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const todayName = dayNames[now.getDay()];

    if (group.scheduleDays && group.scheduleDays.length > 0) {
      if (!group.scheduleDays.includes(todayName)) {
        return {
          isValid: false,
          reason: `⚠️ Hôm nay (${todayName}) không có lịch học môn này (${group.scheduleDays.join(', ')})`,
          badgeText: `🔒 Ngoài lịch học (${todayName})`,
          badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
        };
      }
    }

    // 3. Check Shift Time
    const hour = now.getHours();
    const shift = group.shift || 'Sáng';

    if (shift === 'Sáng' && (hour < 6 || hour >= 12)) {
      return {
        isValid: false,
        reason: `⚠️ Chưa đúng ca học (${shift}). Giờ hiện tại ngoài ca Sáng (06:00 - 12:00)`,
        badgeText: `🔒 Ngoài Ca Sáng`,
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      };
    } else if (shift === 'Chiều' && (hour < 12 || hour >= 18)) {
      return {
        isValid: false,
        reason: `⚠️ Chưa đúng ca học (${shift}). Giờ hiện tại ngoài ca Chiều (12:00 - 18:00)`,
        badgeText: `🔒 Ngoài Ca Chiều`,
        badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
      };
    } else if (shift === 'Tối' && (hour < 17 || hour >= 22)) {
      return {
        isValid: false,
        reason: `⚠️ Chưa đúng ca học (${shift}). Giờ hiện tại ngoài ca Tối (17:30 - 22:00)`,
        badgeText: `🔒 Ngoài Ca Tối`,
        badgeClass: 'bg-purple-100 text-purple-900 border-purple-300',
      };
    }

    return {
      isValid: true,
      reason: '🟢 Đang trong ca học & ngày học chuẩn!',
      badgeText: '🟢 Đúng ca & lịch học',
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    };
  }

  get students(): Student[] {
    return this.selectedGroup?.students || [];
  }

  get filteredStudents(): Student[] {
    if (!this.searchTerm.trim()) return this.students;
    const term = this.searchTerm.toLowerCase().trim();
    return this.students.filter(
      (s) => s.fullName.toLowerCase().includes(term) || s.studentCode.toLowerCase().includes(term),
    );
  }

  get absentCount(): number {
    return Object.values(this.absentMap).filter(Boolean).length;
  }

  get presentCount(): number {
    return this.students.length - this.absentCount;
  }

  toggleAttendance(studentId: string) {
    this.absentMap[studentId] = !this.absentMap[studentId];
  }

  markAllPresent() {
    this.absentMap = {};
  }

  markAllAbsent() {
    for (const st of this.filteredStudents) {
      this.absentMap[st._id] = true;
    }
  }

  submitAttendance() {
    if (!this.selectedGroupId) return;

    const absentStudentIds = Object.keys(this.absentMap).filter((id) => this.absentMap[id]);

    this.isSubmitting = true;
    this.submitResult = null;
    this.cdr.detectChanges();

    this.attendanceService
      .submitAttendance({
        courseGroupId: this.selectedGroupId,
        absentStudentIds,
      })
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res) => {
          this.submitResult = res;
          this.loadMyCallTasks();

          // ✅ Re-check today's record → tự động khóa form sau khi lưu
          this.checkTodayAttendance();

          // Chuyển sang tab Lịch Sử để xác nhận
          this.attendanceMode = 'history';
          this.loadHistory();

          // Auto-hide popup sau 10 giây
          setTimeout(() => {
            this.submitResult = null;
            this.cdr.detectChanges();
          }, 10000);
          this.cdr.detectChanges();
        },
        error: (err) => {
          alert(err.error?.message || 'Không thể lưu điểm danh');
          this.cdr.detectChanges();
        },
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

  /** Kiểm tra xem buổi học có bị khóa hay không (ngày chưa tới hoặc ngày đã chốt sổ) */
  isSessionLocked(session: ScheduleSession): boolean {
    if (!session) return false;

    // Nếu công tắc "Điểm danh linh hoạt" được bật -> Mở khóa tất cả các buổi
    if (this.allowFlexibleAttendance) return false;

    // Buổi học chưa tới ngày (status === 'future') -> Bị khóa 🔒
    if (session.status === 'future') return true;

    // Buổi học đã chốt sổ / đã lưu (status === 'recorded') và KHÔNG có thay đổi chưa lưu -> Bị khóa 🔒
    const key = this.getSessionKey(session);
    if (session.status === 'recorded' && !this.dirtySessions.has(key)) {
      return true;
    }

    return false;
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
      alert(
        `🔒 Buổi học ngày ${new Date(session.scheduledDate).toLocaleDateString('vi-VN')} đã bị khóa (chốt sổ hoặc chưa tới ngày).\n\nHãy bấm "🔓 Bật Điểm Danh Linh Hoạt" ở thẻ thông tin môn học nếu cần mở khóa chỉnh sửa.`,
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
          alert(err.error?.message || 'Không thể lưu điểm danh cho buổi này.');
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

  /** Kiểm tra sinh viên có vắng không phép trong buổi cụ thể không */
  isStudentAbsentInSession(studentId: string, session: ScheduleSession): boolean {
    if (session.status !== 'recorded' || !session.attendance) return false;
    const absentList = session.attendance.absentStudents || [];
    if (!absentList.length) return false;
    return absentList.some((st) => {
      const id = typeof st === 'object' ? st._id : st;
      return id === studentId;
    });
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
    const days = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    return days[d.getDay()] || '';
  }
}
