import { Component, OnInit, OnDestroy, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminTab, visibleDashboardTabs } from './dashboard-tabs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ExcelService, ImportByCourseResult } from '../../services/excel.service';
import { StaffService } from '../../services/staff.service';
import { AnalyticsService, AnalyticsSummary } from '../../services/analytics.service';
import { SettingsService } from '../../services/settings.service';
import { CourseGroupService } from '../../services/course-group.service';
import { TaskService } from '../../services/task.service';
import { AiService } from '../../services/ai.service';
import { NotificationService, ToastType } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';
import { BrandingService } from '../../services/branding.service';
import { PermissionService } from '../../services/permission.service';
import { ClassAssignmentPanelComponent } from '../class-assignment-panel/class-assignment-panel.component';
import { WarningConfigComponent } from '../warning-config/warning-config.component';
import { IntegrationsPanelComponent } from '../integrations-panel/integrations-panel.component';
import { SystemOverviewComponent } from '../system-overview/system-overview.component';
import { StaffProgressComponent } from '../staff-progress/staff-progress.component';
import { StaffAiModalComponent } from '../staff-ai-modal/staff-ai-modal.component';
import {
  User,
  SystemSettings,
  CourseGroup,
  WorkTask,
  TaskStatus,
  Shift,
  Weekday,
  SHIFT,
  WEEKDAYS_BY_JS_DAY,
  DEFAULT_SCHEDULE_DAYS,
  ConfigurableRole,
  Permission,
  PermissionConfig,
  PermissionMatrix,
  TaskCategory,
  TaskPriority,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  Student,
} from '../../models/types';
import { StudentService } from '../../services/student.service';
import { CareCaseService } from '../../services/care-case.service';
import { ViLabelPipe, viLabel } from '../../utils/label.pipe';
import {
  countTasksByStatus,
  formatFileSize,
  isTaskOverdue,
  lastProgressNote,
  taskProgress,
  taskUserName,
} from '../../utils/task-utils';

const emptyTaskForm = () => ({
  title: '',
  description: '',
  assignedTo: '',
  dueDate: '',
  category: 'khac' as TaskCategory,
  priority: 'trung_binh' as TaskPriority,
});

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ViLabelPipe,
    RouterLink,
    ClassAssignmentPanelComponent,
    WarningConfigComponent,
    IntegrationsPanelComponent,
    SystemOverviewComponent,
    StaffProgressComponent,
    StaffAiModalComponent,
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css',
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  activeTab: AdminTab = 'courses';
  triggerToast(type: ToastType, title: string, message: string) {
    this.notify.show(type, message, title);
  }

  // Course Group Management State
  courseGroupList: CourseGroup[] = [];
  filterShift = '';
  searchCourseTerm = '';
  showCourseModal = false;
  editingCourseId = '';
  isSavingCourse = false;
  courseAlertMsg = '';
  modalErrorMsg = '';
  availableDays: Weekday[] = [...WEEKDAYS_BY_JS_DAY.slice(1), WEEKDAYS_BY_JS_DAY[0]];
  courseForm = {
    groupCode: '',
    courseName: '',
    shift: SHIFT.MORNING as Shift,
    scheduleDays: [...DEFAULT_SCHEDULE_DAYS],
    room: 'A.101',
    startTime: '',
    endTime: '',
    periodsPerSession: 4,
    totalPeriods: 0,
    startDate: '',
    endDate: '',
    teacherId: '',
    teacherName: '',
  };

  // Enrolled Student Modal State
  showEnrollModal = false;
  activeGroupForEnroll: CourseGroup | null = null;
  classToEnroll = '';
  mssvToEnroll = '';
  enrollAlertMsg = '';

  // System Settings State
  sysSettings: SystemSettings = {
    systemTitle: 'ITC CARE',
    schoolName: 'Trường Cao Đẳng Công Nghệ Thông Tin TP.HCM (ITC)',
    departmentName: 'Phòng Đào Tạo & Chăm Sóc Sinh Viên',
    supportHotline: '028 3965 1114',
    supportEmail: 'cskh@itc.edu.vn',
    logoDataUrl: '',
    primaryColor: '#673ab7',
    warningLevels: [],
    absenceReasons: [],
    tags: [],
  };
  isSavingSettings = false;
  settingsSaveAlert = '';

  // Excel State (legacy)
  isDownloadingExcel = false;
  isUploadingExcel = false;
  selectedFile: File | null = null;
  excelAlert = '';

  // Excel by Course State (new)
  isDownloadingCourseExcel = false;
  isUploadingCourseExcel = false;
  selectedCourseFile: File | null = null;
  importCourseResult: ImportByCourseResult | null = null;

  // Staff State
  newStaffName = '';
  newStaffEmail = '';
  newStaffPass = '';
  newStaffRole: 'staff' | 'teacher' | 'manager' = 'staff';
  isCreatingStaff = false;
  staffCreatedMsg = '';
  staffGeneratedPass = '';
  staffList: User[] = [];

  showEditStaffModal = false;
  editingStaffId = '';
  editStaffName = '';
  editStaffEmail = '';
  editStaffPass = '';
  editStaffRole: 'staff' | 'teacher' | 'manager' = 'staff';
  isUpdatingStaff = false;

  // Task (Giao Việc) State
  taskList: WorkTask[] = [];
  taskFilterStatus: TaskStatus | '' = '';
  taskForm = emptyTaskForm();
  readonly taskCategories = TASK_CATEGORIES;
  readonly taskPriorities = TASK_PRIORITIES;
  isCreatingTask = false;
  showTaskReviewModal = false;
  reviewingTask: WorkTask | null = null;
  reviewNoteInput = '';
  /** Quality score (1–5) given when approving; null = not scored. */
  reviewScore: number | null = null;
  aiEvidenceAnalysis = '';
  isAnalyzingEvidence = false;

  // AI Staff Performance State
  /** Staff member whose AI assessment modal is open. */
  staffAiTarget: { id: string; name: string } | null = null;

  // Analytics State
  analyticsData: AnalyticsSummary | null = null;
  /** Warning level name shown in the warning table ('' = all levels). */
  warningFilter = '';
  isExportingCareReport = false;
  isRefreshingAnalytics = false;
  lastAnalyticsUpdate: Date | null = null;
  private analyticsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private excelService: ExcelService,
    private staffService: StaffService,
    private analyticsService: AnalyticsService,
    private settingsService: SettingsService,
    private courseGroupService: CourseGroupService,
    protected taskService: TaskService,
    private aiService: AiService,
    private notify: NotificationService,
    private cdr: ChangeDetectorRef,
  ) {}

  private readonly auth = inject(AuthService);
  private readonly permissionService = inject(PermissionService);
  private readonly branding = inject(BrandingService);
  readonly visibleTabs = visibleDashboardTabs(this.auth);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly studentApi = inject(StudentService);
  private readonly careCaseService = inject(CareCaseService);
  private readonly destroyRef = inject(DestroyRef);
  /** AI staff assessment belongs to whoever manages tasks (Trưởng phòng). */
  readonly canAssessStaff = this.auth.can('tasks.manage');
  readonly isFullAdmin = this.auth.isAdmin();
  readonly isManager = this.auth.isManager();

  private hasTab(tab: AdminTab) {
    return this.visibleTabs.some((t) => t.id === tab);
  }

  ngOnInit(): void {
    // Load only what the visible tabs need (other roles cannot read admin-only data).
    this.activeTab = this.visibleTabs[0]?.id ?? 'analytics';
    if (this.hasTab('staff') || this.hasTab('tasks') || this.hasTab('courses'))
      this.loadStaffList();
    if (this.hasTab('analytics')) this.loadAnalytics();
    if (this.hasTab('settings')) this.loadSettings();
    if (this.hasTab('courses') || this.hasTab('excel')) this.loadCourseGroups();
    // The sidebar selects the tab through ?tab=; a missing or unknown tab falls back to the first.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const requested = params.get('tab') as AdminTab | null;
      if (requested && this.hasTab(requested)) {
        if (requested !== this.activeTab || !this.tabOpened) this.switchTab(requested);
        this.tabOpened = true;
        // Zoneless: a router emission is not a template event, so re-render explicitly.
        this.cdr.markForCheck();
      } else if (this.visibleTabs.length) {
        this.openTab(this.visibleTabs[0].id, true);
      }
    });
  }

  private tabOpened = false;

  /** Navigates to a tab (the sidebar highlights it and the URL can be shared). */
  openTab(tab: AdminTab, replaceUrl = false) {
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab }, replaceUrl });
  }

  ngOnDestroy(): void {
    if (this.analyticsInterval) clearInterval(this.analyticsInterval);
  }

  switchTab(tab: AdminTab) {
    this.activeTab = tab;
    // Dừng auto-refresh cũ khi đổi tab
    if (this.analyticsInterval) {
      clearInterval(this.analyticsInterval);
      this.analyticsInterval = null;
    }
    if (tab === 'analytics') {
      this.loadAnalytics();
      // Auto-refresh mỗi 60 giây khi đang ở tab analytics
      this.analyticsInterval = setInterval(() => {
        if (!document.hidden) this.loadAnalytics();
      }, 60000);
    } else if (tab === 'settings') {
      this.loadSettings();
    } else if (tab === 'permissions') {
      this.loadPermissions();
    } else if (tab === 'courses' || tab === 'excel') {
      this.loadCourseGroups();
    } else if (tab === 'tasks') {
      this.loadTasks();
      if (!this.staffList.length) this.loadStaffList();
    }
  }

  // Task (Giao Việc) Management Methods
  get staffOnlyList(): User[] {
    return this.staffList.filter((s) => s.role === 'staff' && s.status === 'active');
  }

  loadTasks() {
    this.taskService
      .getAllTasks(this.taskFilterStatus ? { status: this.taskFilterStatus } : undefined)
      .subscribe({
        next: (list) => {
          this.taskList = list;
          this.cdr.detectChanges();
        },
        error: (err) => console.error('Load tasks error:', err),
      });
  }

  taskStatusCount(status: TaskStatus): number {
    return countTasksByStatus(this.taskList, status);
  }

  readonly taskUserName = taskUserName;
  readonly isTaskOverdue = isTaskOverdue;
  readonly formatFileSize = formatFileSize;
  readonly lastProgressNote = lastProgressNote;
  readonly taskProgress = taskProgress;

  // ---- "Chăm sóc sinh viên" task for one student → a directed care case.
  readonly canDirectCare = this.auth.can('care.manage') && this.auth.can('students.view');
  careStudentQuery = '';
  careStudentResults: Student[] = [];
  careStudent: Student | null = null;

  findCareStudents() {
    const q = this.careStudentQuery.trim();
    if (q.length < 2) {
      this.careStudentResults = [];
      return;
    }
    this.studentApi.list({ search: q, limit: 8 }).subscribe({
      next: (res) => {
        this.careStudentResults = res.items;
        this.cdr.detectChanges();
      },
      error: () => (this.careStudentResults = []),
    });
  }

  pickCareStudent(student: Student) {
    this.careStudent = student;
    this.careStudentResults = [];
    this.careStudentQuery = `${student.studentCode} · ${student.fullName}`;
  }

  private createCareFromTask() {
    const student = this.careStudent!;
    this.isCreatingTask = true;
    this.careCaseService
      .create({
        studentId: student._id,
        reason: this.taskForm.title.trim(),
        assignedStaffId: this.taskForm.assignedTo,
        directive: this.taskForm.description.trim(),
        dueDate: this.taskForm.dueDate || null,
        fromTask: true,
      })
      .pipe(
        finalize(() => {
          this.isCreatingTask = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (c) => {
          this.triggerToast(
            'success',
            'Đã Mở Hồ Sơ Chăm Sóc!',
            `Đã chỉ đạo chăm sóc ${student.fullName}.`,
          );
          this.taskForm = emptyTaskForm();
          this.careStudent = null;
          this.careStudentQuery = '';
          this.router.navigate(['/care'], { queryParams: { case: c._id } });
        },
        error: (err) =>
          this.triggerToast(
            'error',
            'Không Mở Được Hồ Sơ',
            err.status === 409
              ? 'Sinh viên đã có hồ sơ chăm sóc đang mở — hãy chỉ đạo trong hồ sơ đó.'
              : err.error?.message || 'Không mở được hồ sơ chăm sóc',
          ),
      });
  }

  createTask() {
    if (
      !this.taskForm.title.trim() ||
      !this.taskForm.description.trim() ||
      !this.taskForm.assignedTo
    ) {
      this.triggerToast(
        'error',
        'Thiếu Thông Tin',
        'Vui lòng nhập tiêu đề, mô tả và chọn nhân viên nhận việc!',
      );
      return;
    }
    if (this.taskForm.category === 'cham_soc_sv' && this.careStudent)
      return this.createCareFromTask();
    this.isCreatingTask = true;
    this.cdr.detectChanges();
    this.taskService
      .createTask({
        title: this.taskForm.title.trim(),
        description: this.taskForm.description.trim(),
        assignedTo: this.taskForm.assignedTo,
        dueDate: this.taskForm.dueDate || null,
        category: this.taskForm.category,
        priority: this.taskForm.priority,
      })
      .pipe(
        finalize(() => {
          this.isCreatingTask = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res) => {
          this.triggerToast('success', 'Đã Giao Việc!', res.message);
          this.taskForm = emptyTaskForm();
          this.loadTasks();
        },
        error: (err) =>
          this.triggerToast(
            'error',
            'Lỗi Giao Việc',
            err.error?.message || 'Không thể giao nhiệm vụ',
          ),
      });
  }

  async deleteTask(task: WorkTask) {
    const ok = await this.notify.confirm({
      title: 'Xóa nhiệm vụ?',
      message: `Nhiệm vụ "${task.title}" và các tệp minh chứng đi kèm sẽ bị xóa vĩnh viễn.`,
      confirmText: 'Xóa nhiệm vụ',
      danger: true,
    });
    if (!ok) return;
    this.taskService.deleteTask(task._id).subscribe({
      next: (res) => {
        this.triggerToast('success', 'Đã Xóa Nhiệm Vụ', res.message);
        this.loadTasks();
      },
      error: (err) =>
        this.triggerToast('error', 'Lỗi Xóa', err.error?.message || 'Không thể xóa nhiệm vụ'),
    });
  }

  openReviewModal(task: WorkTask) {
    this.reviewingTask = task;
    this.reviewNoteInput = '';
    this.reviewScore = null;
    this.aiEvidenceAnalysis = '';
    this.showTaskReviewModal = true;
    this.cdr.detectChanges();
  }

  analyzeTaskEvidenceWithAi() {
    if (!this.reviewingTask) return;
    this.isAnalyzingEvidence = true;
    this.aiEvidenceAnalysis = '';
    this.aiService.reviewTaskEvidence(this.reviewingTask._id).subscribe({
      next: (res) => {
        this.aiEvidenceAnalysis = res.analysis;
        this.isAnalyzingEvidence = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isAnalyzingEvidence = false;
        this.aiEvidenceAnalysis =
          '⚠️ ' + (err.error?.message || 'Không thể phân tích minh chứng bằng AI.');
        this.cdr.detectChanges();
      },
    });
  }

  useAiAnalysisAsReviewNote() {
    if (this.aiEvidenceAnalysis) this.reviewNoteInput = this.aiEvidenceAnalysis;
  }

  submitTaskReview(approve: boolean) {
    if (!this.reviewingTask) return;
    this.taskService
      .reviewTask(this.reviewingTask._id, approve, this.reviewNoteInput.trim(), this.reviewScore)
      .subscribe({
        next: (res) => {
          this.triggerToast(
            approve ? 'success' : 'info',
            approve ? 'Đã Duyệt & Đóng!' : 'Đã Từ Chối',
            res.message,
          );
          this.showTaskReviewModal = false;
          this.loadTasks();
        },
        error: (err) =>
          this.triggerToast(
            'error',
            'Lỗi Duyệt Nhiệm Vụ',
            err.error?.message || 'Không thể duyệt nhiệm vụ',
          ),
      });
  }

  openStaffAiAssessment(staff: User) {
    this.staffAiTarget = { id: staff._id || staff.id || '', name: staff.fullName };
  }

  // Course Group Management Methods
  loadCourseGroups() {
    this.courseGroupService.getCourseGroups(this.filterShift, this.searchCourseTerm).subscribe({
      next: (list) => {
        this.courseGroupList = list;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Load course groups error:', err),
    });
  }

  getPrimaryDayFromDate(dateStr: string): Weekday | '' {
    if (!dateStr) return '';
    const dt = new Date(dateStr);
    if (isNaN(dt.getTime())) return '';
    return WEEKDAYS_BY_JS_DAY[dt.getDay()];
  }

  onStartDateChange() {
    const fixedDay = this.getPrimaryDayFromDate(this.courseForm.startDate);
    if (fixedDay) {
      if (!this.courseForm.scheduleDays.includes(fixedDay)) {
        this.courseForm.scheduleDays.push(fixedDay);
      }
    }
    this.cdr.detectChanges();
  }

  openCourseModal(group?: CourseGroup) {
    this.modalErrorMsg = '';
    this.isSavingCourse = false;
    if (group) {
      this.editingCourseId = group._id || group._id || '';
      let tId = '';
      if (group.teacherId) {
        tId =
          typeof group.teacherId === 'string'
            ? group.teacherId
            : group.teacherId._id || group.teacherId.id || '';
      }
      const formatDateStr = (d?: string | Date) => {
        if (!d) return '';
        const dt = new Date(d);
        return isNaN(dt.getTime()) ? '' : dt.toISOString().split('T')[0];
      };

      this.courseForm = {
        groupCode: group.groupCode,
        courseName: group.courseName || '',
        shift: group.shift || SHIFT.MORNING,
        scheduleDays: group.scheduleDays ? [...group.scheduleDays] : [...DEFAULT_SCHEDULE_DAYS],
        room: group.room || 'A.101',
        startTime: group.startTime || '',
        endTime: group.endTime || '',
        periodsPerSession: group.periodsPerSession || 4,
        totalPeriods: group.totalPeriods || 0,
        startDate: formatDateStr(group.startDate),
        endDate: formatDateStr(group.endDate),
        teacherId: tId,
        teacherName: group.teacherName || '',
      };
    } else {
      this.editingCourseId = '';
      const todayStr = new Date().toISOString().split('T')[0];
      const endDt = new Date();
      endDt.setMonth(endDt.getMonth() + 3);
      const endStr = endDt.toISOString().split('T')[0];

      this.courseForm = {
        groupCode: '',
        courseName: '',
        shift: SHIFT.MORNING,
        scheduleDays: [...DEFAULT_SCHEDULE_DAYS],
        room: 'A.101',
        startTime: '',
        endTime: '',
        periodsPerSession: 4,
        totalPeriods: 0,
        startDate: todayStr,
        endDate: endStr,
        teacherId: '',
        teacherName: '',
      };
    }
    this.onStartDateChange();
    this.showCourseModal = true;
    this.cdr.detectChanges();
  }

  toggleScheduleDay(day: Weekday) {
    const fixedDay = this.getPrimaryDayFromDate(this.courseForm.startDate);
    if (day === fixedDay) {
      this.triggerToast(
        'info',
        'Thứ Học Cố Định',
        'Ngày ' + viLabel(day) + ' là thứ trùng với Ngày bắt đầu học phần, không thể tắt!',
      );
      return;
    }
    if (this.courseForm.scheduleDays.includes(day)) {
      if (this.courseForm.scheduleDays.length > 1) {
        this.courseForm.scheduleDays = this.courseForm.scheduleDays.filter((d) => d !== day);
      }
    } else {
      this.courseForm.scheduleDays.push(day);
    }
    this.cdr.detectChanges();
  }

  saveCourseGroup() {
    if (this.isSavingCourse) return;
    this.modalErrorMsg = '';
    if (!this.courseForm.groupCode.trim() || !this.courseForm.courseName.trim()) {
      this.modalErrorMsg = '⚠️ Vui lòng nhập đầy đủ Mã Nhóm và Tên Môn Học!';
      this.cdr.detectChanges();
      return;
    }
    this.isSavingCourse = true;
    this.cdr.detectChanges();

    // Safety timeout fallback: reset state after 8 seconds if no response
    const saveTimer = setTimeout(() => {
      if (this.isSavingCourse) {
        this.isSavingCourse = false;
        this.modalErrorMsg =
          '⚠️ Kết nối máy chủ phản hồi chậm hoặc có lỗi xảy ra. Vui lòng thử lại!';
        this.cdr.detectChanges();
      }
    }, 8000);

    if (this.editingCourseId) {
      this.courseGroupService
        .updateCourseGroup(this.editingCourseId, this.courseForm)
        .pipe(
          finalize(() => {
            clearTimeout(saveTimer);
            this.isSavingCourse = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: (res) => {
            this.showCourseModal = false;
            const msg = res.message || 'Cập nhật thông tin học phần thành công!';
            this.courseAlertMsg = msg;
            this.triggerToast('success', 'Thành Công!', msg);
            setTimeout(() => (this.courseAlertMsg = ''), 5000);
            this.loadCourseGroups();
            this.cdr.detectChanges();
          },
          error: (err) => {
            const errMsg = err.error?.message || err.message || 'Lỗi khi cập nhật học phần';
            this.modalErrorMsg = '⚠️ ' + errMsg;
            this.triggerToast('error', 'Lỗi Cập Nhật', errMsg);
            this.cdr.detectChanges();
          },
        });
    } else {
      this.courseGroupService
        .createCourseGroup(this.courseForm)
        .pipe(
          finalize(() => {
            clearTimeout(saveTimer);
            this.isSavingCourse = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: (res) => {
            this.showCourseModal = false;
            const msg =
              'Đã thêm thành công học phần ' +
              (res.group?.courseName || '') +
              ' (' +
              (res.group?.groupCode || '') +
              ')!';
            this.courseAlertMsg = msg;
            this.triggerToast('success', 'Tạo Học Phần Thành Công!', msg);
            setTimeout(() => (this.courseAlertMsg = ''), 5000);
            this.loadCourseGroups();
            this.cdr.detectChanges();
          },
          error: (err) => {
            const errMsg = err.error?.message || err.message || 'Lỗi khi tạo học phần mới';
            this.modalErrorMsg = '⚠️ ' + errMsg;
            this.triggerToast('error', 'Lỗi Tạo Học Phần', errMsg);
            this.cdr.detectChanges();
          },
        });
    }
  }

  async deleteCourseGroup(id: string) {
    const ok = await this.notify.confirm({
      title: 'Xóa nhóm học phần?',
      message: 'Toàn bộ điểm danh của học phần này cũng sẽ bị xóa.',
      confirmText: 'Xóa học phần',
      danger: true,
    });
    if (!ok) return;
    this.courseGroupService.deleteCourseGroup(id).subscribe({
      next: (res) => {
        this.courseAlertMsg = res.message;
        setTimeout(() => (this.courseAlertMsg = ''), 4000);
        this.loadCourseGroups();
      },
      error: (err) => this.notify.error(err.error?.message || 'Lỗi khi xóa học phần'),
    });
  }

  // Enrolled Student Modal Logic
  openEnrollModal(group: CourseGroup) {
    this.activeGroupForEnroll = group;
    this.classToEnroll = '';
    this.mssvToEnroll = '';
    this.enrollAlertMsg = '';
    this.showEnrollModal = true;
  }

  enrollEntireClass() {
    if (!this.activeGroupForEnroll || !this.classToEnroll.trim()) return;
    this.courseGroupService
      .assignClass(this.activeGroupForEnroll._id, this.classToEnroll.trim())
      .subscribe({
        next: (res) => {
          this.activeGroupForEnroll = res.group;
          this.enrollAlertMsg = res.message;
          this.classToEnroll = '';
          this.loadCourseGroups();
        },
        error: (err) =>
          this.notify.error(err.error?.message || 'Không thể đăng ký cả lớp vào môn học'),
      });
  }

  enrollSingleStudent() {
    if (!this.activeGroupForEnroll || !this.mssvToEnroll.trim()) return;
    this.courseGroupService
      .assignStudent(this.activeGroupForEnroll._id, { studentCode: this.mssvToEnroll.trim() })
      .subscribe({
        next: (res) => {
          this.activeGroupForEnroll = res.group;
          this.enrollAlertMsg = res.message;
          this.mssvToEnroll = '';
          this.loadCourseGroups();
        },
        error: (err) =>
          this.notify.error(err.error?.message || 'Không tìm thấy sinh viên với MSSV này'),
      });
  }

  unenrollStudent(studentId: string) {
    if (!this.activeGroupForEnroll) return;
    this.courseGroupService.removeStudent(this.activeGroupForEnroll._id, studentId).subscribe({
      next: (res) => {
        this.activeGroupForEnroll = res.group;
        this.enrollAlertMsg = res.message;
        this.loadCourseGroups();
      },
      error: (err) => this.notify.error(err.error?.message || 'Lỗi khi rút tên sinh viên'),
    });
  }

  // System Settings Logic
  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (s) => {
        if (s) {
          this.sysSettings = s;
        }
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Load settings error:', err),
    });
  }

  saveSettings() {
    this.isSavingSettings = true;
    this.settingsSaveAlert = '';

    const {
      systemTitle,
      schoolName,
      departmentName,
      supportHotline,
      supportEmail,
      logoDataUrl,
      primaryColor,
    } = this.sysSettings;
    this.settingsService
      .updateSettings({
        systemTitle,
        schoolName,
        departmentName,
        supportHotline,
        supportEmail,
        logoDataUrl,
        primaryColor,
      })
      .subscribe({
        next: (res) => {
          this.isSavingSettings = false;
          this.settingsSaveAlert = res.message || 'Đã lưu cấu hình thành công!';
          this.notify.success(this.settingsSaveAlert);
          this.branding.apply(res.settings);
          this.cdr.markForCheck();
          setTimeout(() => (this.settingsSaveAlert = ''), 4000);
        },
        error: (err) => {
          this.isSavingSettings = false;
          this.cdr.markForCheck();
          this.notify.error(err.error?.message || 'Lỗi khi lưu cấu hình');
        },
      });
  }

  /** Reads the chosen logo as a data URL (kept small: it is stored in the settings). */
  onLogoSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 300 * 1024) {
      this.notify.error('Logo tối đa 300 KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.sysSettings.logoDataUrl = String(reader.result);
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }

  // Role permission matrix (Phân quyền)
  permissionConfig: PermissionConfig | null = null;
  /** Working copy edited by the checkboxes; saved with savePermissions(). */
  permissionDraft: PermissionMatrix | null = null;
  isSavingPermissions = false;

  loadPermissions() {
    this.permissionService.getConfig().subscribe({
      next: (config) => this.applyPermissionConfig(config),
      error: (err) => this.notify.error(err.error?.message || 'Không tải được bảng phân quyền'),
    });
  }

  private applyPermissionConfig(config: PermissionConfig) {
    this.permissionConfig = config;
    this.permissionDraft = this.copyMatrix(config.matrix);
    this.cdr.detectChanges();
  }

  private copyMatrix(matrix: PermissionMatrix): PermissionMatrix {
    return {
      manager: [...matrix.manager],
      staff: [...matrix.staff],
      teacher: [...matrix.teacher],
    };
  }

  /** Permissions grouped for display: one block per group name, groups in first-seen order. */
  get permissionGroups(): { group: string; items: PermissionConfig['permissions'] }[] {
    const groups: { group: string; items: PermissionConfig['permissions'] }[] = [];
    for (const item of this.permissionConfig?.permissions ?? []) {
      const existing = groups.find((g) => g.group === item.group);
      if (existing) existing.items.push(item);
      else groups.push({ group: item.group, items: [item] });
    }
    return groups;
  }

  hasPermission(role: ConfigurableRole, key: Permission): boolean {
    return Boolean(this.permissionDraft?.[role].includes(key));
  }

  /** False when the permission cannot work for that role (e.g. attendance for CSKH staff). */
  permissionApplies(role: ConfigurableRole, key: Permission): boolean {
    const item = this.permissionConfig?.permissions.find((p) => p.key === key);
    return !item?.onlyRoles || item.onlyRoles.includes(role);
  }

  togglePermission(role: ConfigurableRole, key: Permission) {
    if (!this.permissionDraft || !this.permissionApplies(role, key)) return;
    const list = this.permissionDraft[role];
    this.permissionDraft[role] = list.includes(key)
      ? list.filter((k) => k !== key)
      : [...list, key];
  }

  isDefaultPermission(role: ConfigurableRole, key: Permission): boolean {
    return Boolean(this.permissionConfig?.defaults[role].includes(key));
  }

  get permissionsChanged(): boolean {
    const saved = this.permissionConfig?.matrix;
    const draft = this.permissionDraft;
    if (!saved || !draft) return false;
    return (Object.keys(saved) as ConfigurableRole[]).some(
      (role) =>
        saved[role].length !== draft[role].length ||
        saved[role].some((key) => !draft[role].includes(key)),
    );
  }

  resetPermissionsToDefault() {
    if (this.permissionConfig)
      this.permissionDraft = this.copyMatrix(this.permissionConfig.defaults);
  }

  discardPermissionChanges() {
    if (this.permissionConfig) this.permissionDraft = this.copyMatrix(this.permissionConfig.matrix);
  }

  savePermissions() {
    if (!this.permissionDraft) return;
    this.isSavingPermissions = true;
    this.permissionService
      .updateMatrix(this.permissionDraft)
      .pipe(finalize(() => (this.isSavingPermissions = false)))
      .subscribe({
        next: (res) => {
          this.applyPermissionConfig(res);
          this.notify.success(res.message || 'Đã cập nhật phân quyền!');
        },
        error: (err) => this.notify.error(err.error?.message || 'Lỗi khi lưu phân quyền'),
      });
  }

  loadAnalytics() {
    this.isRefreshingAnalytics = true;
    this.cdr.detectChanges();
    this.analyticsService.getAnalyticsSummary().subscribe({
      next: (data) => {
        this.analyticsData = data;
        this.lastAnalyticsUpdate = new Date();
        this.isRefreshingAnalytics = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Load analytics error:', err);
        this.isRefreshingAnalytics = false;
        this.cdr.detectChanges();
      },
    });
  }

  get filteredWarningList() {
    const list = this.analyticsData?.warningList ?? [];
    return this.warningFilter
      ? list.filter((w) => w.warningLevel.name === this.warningFilter)
      : list;
  }

  get analyticsCards() {
    const m = this.analyticsData?.metrics;
    const closing = m?.closingCases || 0;
    return [
      {
        label: 'Hồ sơ chăm sóc',
        value: m?.totalCases || 0,
        sub: '',
        tone: 'an-violet',
        icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
      },
      {
        label: 'Chờ chỉ đạo',
        value: m?.awaitingCases || 0,
        sub: '',
        tone: 'an-amber',
        icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
      },
      {
        label: 'Đang chăm sóc',
        value: m?.inProgressCases || 0,
        sub: closing ? `${closing} chờ duyệt kết thúc` : '',
        tone: 'an-sky',
        icon: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92',
      },
      {
        label: 'Đã kết thúc',
        value: m?.closedCases || 0,
        sub: '',
        tone: 'an-green',
        icon: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
      },
      {
        label: 'Mức cấm thi',
        value: m?.examBanRiskCount || 0,
        sub: '',
        tone: 'an-rose',
        icon: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0M12 9v4M12 17h.01',
      },
    ];
  }

  trackCard = (_: number, c: { label: string }) => c.label;

  get maxAbsenceCount(): number {
    if (!this.analyticsData?.courseAbsenceStats?.length) return 1;
    return Math.max(...this.analyticsData.courseAbsenceStats.map((s) => s.absentCount), 1);
  }

  get maxReasonCount(): number {
    if (!this.analyticsData?.reasonStats?.length) return 1;
    return Math.max(...this.analyticsData.reasonStats.map((s) => s.count), 1);
  }

  calcPercentage(val: number, maxVal: number): number {
    if (!maxVal) return 0;
    return Math.min(Math.round((val / maxVal) * 100), 100);
  }

  downloadCareReport() {
    this.isExportingCareReport = true;
    this.analyticsService.exportCareReport().subscribe({
      next: (blob) => {
        this.isExportingCareReport = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Bao_Cao_Tong_Hop_Cham_Soc_Sinh_Vien.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.isExportingCareReport = false;
        this.notify.error('Không thể xuất báo cáo chăm sóc Excel');
      },
    });
  }

  // Component 2: Excel logic
  downloadExcelTemplate() {
    this.isDownloadingExcel = true;
    this.excelService.exportTemplate().subscribe({
      next: (blob) => {
        this.isDownloadingExcel = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Danh_Sach_Sinh_Vien_Theo_Lop.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.isDownloadingExcel = false;
        this.notify.error('Không thể xuất file Excel mẫu');
      },
    });
  }

  /** Download course-based Excel template */
  downloadCourseTemplate() {
    this.isDownloadingCourseExcel = true;
    this.excelService.exportCourseTemplate().subscribe({
      next: (blob) => {
        this.isDownloadingCourseExcel = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Mau_Nhap_SV_Theo_HocPhan_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.isDownloadingCourseExcel = false;
        this.triggerToast(
          'error',
          'Lỗi Xuất File',
          err.error?.message || 'Không thể tạo file mẫu Excel',
        );
      },
    });
  }

  onFileSelected(event: any) {
    if (event.target.files && event.target.files.length > 0) {
      this.selectedFile = event.target.files[0];
    }
  }

  onCourseFileSelected(event: any) {
    if (event.target.files && event.target.files.length > 0) {
      this.selectedCourseFile = event.target.files[0];
      this.importCourseResult = null;
    }
  }

  uploadExcelFile() {
    if (!this.selectedFile) return;
    this.isUploadingExcel = true;
    this.excelAlert = '';

    this.excelService.importData(this.selectedFile).subscribe({
      next: (res) => {
        this.isUploadingExcel = false;
        this.excelAlert = res.message;
        this.selectedFile = null;
        this.loadCourseGroups();
      },
      error: (err) => {
        this.isUploadingExcel = false;
        this.notify.error(err.error?.message || 'Lỗi khi đồng bộ file Excel');
      },
    });
  }

  /** Upload file Excel theo học phần (new flow) */
  uploadByCourse() {
    if (!this.selectedCourseFile) return;
    this.isUploadingCourseExcel = true;
    this.importCourseResult = null;

    this.excelService.importByCourse(this.selectedCourseFile).subscribe({
      next: (res) => {
        this.isUploadingCourseExcel = false;
        this.importCourseResult = res;
        this.triggerToast('success', 'Upload Thành Công!', res.message);
        this.loadCourseGroups();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isUploadingCourseExcel = false;
        const msg = err.error?.message || 'Lỗi khi đồng bộ file Excel theo học phần';
        this.triggerToast('error', 'Lỗi Upload', msg);
        this.cdr.detectChanges();
      },
    });
  }

  // Component 3: Staff Management logic
  loadStaffList() {
    this.staffService.getStaffList().subscribe({
      next: (list) => {
        this.staffList = list;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Load staff error:', err),
    });
  }

  copyPasswordToClipboard(pass: string) {
    if (!pass) return;
    navigator.clipboard
      .writeText(pass)
      .then(() => {
        this.triggerToast(
          'success',
          'Đã Sao Chép!',
          'Mật khẩu đã được lưu vào khay nhớ tạm (Clipboard).',
        );
      })
      .catch(() => {
        this.triggerToast('info', 'Mật Khẩu', pass);
      });
  }

  createStaffAccount() {
    if (!this.newStaffName.trim() || !this.newStaffEmail.trim()) return;
    this.isCreatingStaff = true;
    this.staffCreatedMsg = '';
    this.staffGeneratedPass = '';
    this.cdr.detectChanges();

    const payload = {
      fullName: this.newStaffName.trim(),
      email: this.newStaffEmail.trim(),
      customPassword: this.newStaffPass.trim() || undefined,
      role: this.newStaffRole,
    };

    this.staffService
      .createStaff(payload)
      .pipe(
        finalize(() => {
          this.isCreatingStaff = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res) => {
          this.staffCreatedMsg = res.message + ' ' + this.emailStatusText(res.emailSent);
          if (res.generatedPassword) {
            this.staffGeneratedPass = res.generatedPassword;
          }
          this.triggerToast(
            res.emailSent ? 'success' : 'warning',
            'Tạo Nhân Viên Thành Công!',
            this.emailStatusText(res.emailSent),
          );
          this.newStaffName = '';
          this.newStaffEmail = '';
          this.newStaffPass = '';
          this.newStaffRole = 'staff';
          this.loadStaffList();
          this.cdr.detectChanges();
        },
        error: (err) => {
          const errMsg = err.error?.message || err.message || 'Không thể tạo nhân viên';
          this.triggerToast('error', 'Lỗi Tạo Nhân Viên', errMsg);
          this.cdr.detectChanges();
        },
      });
  }

  /** "Trần Thị Mai" → "TM", for the avatar in the staff list. */
  staffInitials(name = ''): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  }

  openEditStaffModal(staff: User) {
    this.editingStaffId = staff.id || (staff as any)._id || '';
    this.editStaffName = staff.fullName;
    this.editStaffEmail = staff.email;
    this.editStaffPass = '';
    this.editStaffRole =
      staff.role === 'teacher' || staff.role === 'manager' ? staff.role : 'staff';
    this.showEditStaffModal = true;
    this.cdr.detectChanges();
  }

  saveEditStaff() {
    if (!this.editingStaffId || !this.editStaffName.trim() || !this.editStaffEmail.trim()) return;
    this.isUpdatingStaff = true;
    this.cdr.detectChanges();

    const payload: any = {
      fullName: this.editStaffName.trim(),
      email: this.editStaffEmail.trim(),
      role: this.editStaffRole,
    };
    if (this.editStaffPass.trim()) {
      payload.password = this.editStaffPass.trim();
    }

    this.staffService
      .updateStaff(this.editingStaffId, payload)
      .pipe(
        finalize(() => {
          this.isUpdatingStaff = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res) => {
          this.showEditStaffModal = false;
          const msg = res.message || 'Cập nhật tài khoản nhân viên thành công!';
          this.triggerToast('success', 'Thành Công!', msg);
          if (this.editStaffPass.trim()) {
            this.staffCreatedMsg =
              'Đã cập nhật thông tin và mật khẩu mới cho ' + this.editStaffName + '!';
            this.staffGeneratedPass = this.editStaffPass.trim();
          }
          this.loadStaffList();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.notify.error(err.error?.message || 'Lỗi khi cập nhật nhân viên');
          this.cdr.detectChanges();
        },
      });
  }

  private emailStatusText(emailSent: boolean): string {
    return emailSent
      ? 'Đã gửi mật khẩu tới email của nhân viên.'
      : 'Không gửi được email — hãy tự chuyển mật khẩu bên dưới cho nhân viên.';
  }

  async resetStaffPassword(staff: User) {
    const customPass = await this.notify.prompt({
      title: 'Đặt lại mật khẩu',
      message: `Nhập mật khẩu mới cho "${staff.fullName}". Để trống để hệ thống tự sinh mật khẩu ngẫu nhiên.`,
      placeholder: 'Mật khẩu mới (không bắt buộc)',
      confirmText: 'Đặt lại',
    });
    if (customPass === null) return; // User cancelled

    const targetId = staff.id || (staff as any)._id || '';
    this.staffService.resetStaffPassword(targetId, customPass).subscribe({
      next: (res) => {
        this.staffCreatedMsg =
          'Đã đặt lại mật khẩu cho nhân viên ' +
          staff.fullName +
          '! ' +
          this.emailStatusText(res.emailSent);
        this.staffGeneratedPass = res.newPassword;
        this.triggerToast(
          res.emailSent ? 'success' : 'warning',
          'Reset Mật Khẩu Thành Công!',
          this.emailStatusText(res.emailSent),
        );
        this.copyPasswordToClipboard(res.newPassword);
        this.loadStaffList();
        this.cdr.detectChanges();
      },
      error: (err) => {
        const msg =
          err.error?.message || err.statusText || 'Không thể kết nối đến máy chủ API backend';
        this.triggerToast('error', 'Lỗi Reset Mật Khẩu', msg);
        this.cdr.detectChanges();
      },
    });
  }

  toggleStaffStatus(staff: User) {
    const newStatus = staff.status === 'active' ? 'inactive' : 'active';
    this.staffService.toggleStaffStatus(staff.id || (staff as any)._id, newStatus).subscribe({
      next: () => {
        this.loadStaffList();
        this.cdr.detectChanges();
      },
      error: (err) => {
        const msg = err.error?.message || err.statusText || 'Lỗi cập nhật trạng thái';
        this.notify.error(msg);
        this.cdr.detectChanges();
      },
    });
  }

  async deleteStaffAccount(staff: User) {
    const ok = await this.notify.confirm({
      title: 'Xóa vĩnh viễn tài khoản?',
      message: `${staff.fullName} (${staff.email}) sẽ bị xóa khỏi hệ thống. Không thể hoàn tác.`,
      confirmText: 'Xóa tài khoản',
      danger: true,
    });
    if (!ok) return;
    const targetId = staff.id || (staff as any)._id || '';
    this.staffService.deleteStaff(targetId).subscribe({
      next: (res) => {
        this.triggerToast('success', 'Đã Xóa Nhân Viên', res.message);
        this.loadStaffList();
        this.cdr.detectChanges();
      },
      error: (err) => {
        const msg = err.error?.message || err.statusText || 'Không thể xóa tài khoản nhân viên';
        this.triggerToast('error', 'Lỗi Xóa Nhân Viên', msg);
        this.cdr.detectChanges();
      },
    });
  }
}
