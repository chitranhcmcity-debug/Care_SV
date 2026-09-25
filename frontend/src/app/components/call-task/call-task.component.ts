import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CallTaskService } from '../../services/call-task.service';
import { AuthService } from '../../services/auth.service';
import { SettingsService } from '../../services/settings.service';
import { AiService } from '../../services/ai.service';
import { NotificationService } from '../../services/notification.service';
import { CallService, CallTarget } from '../../services/call.service';
import { CallTask, CALL_STATUS, Student360Profile, SystemSettings, User } from '../../models/types';
import { StaffService } from '../../services/staff.service';

@Component({
  selector: 'app-call-task',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './call-task.component.html',
})
export class CallTaskComponent implements OnInit {
  tasks: CallTask[] = [];
  sysSettings: SystemSettings | null = null;

  // Filter States
  filterClassCode = '';
  filterGroupCode = '';
  filterStatus = '';

  // 360 Profile Modal State
  show360Modal = false;
  student360Data: Student360Profile | null = null;

  // AI call-advice state, keyed by task id
  aiAdvice: Record<string, { loading: boolean; text?: string; error?: string }> = {};

  constructor(
    private callTaskService: CallTaskService,
    private settingsService: SettingsService,
    public authService: AuthService,
    private aiService: AiService,
    private notify: NotificationService,
    private calls: CallService,
    private staffService: StaffService,
  ) {}

  private readonly cdr = inject(ChangeDetectorRef);

  /** Calls go through the app's call dialog, so each one is logged (and can be recorded). */
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
    context: { callTaskId?: string } = {},
  ) {
    event.preventDefault();
    if (student?._id) this.calls.open({ student, target, ...context });
  }

  /** 'callTasks.viewAll' shows every staff member's tasks; without 'callTasks.update' that is
   *  the only view. */
  viewAll = false;

  /** Both views are available: the user may update their own tasks and oversee everyone's. */
  canToggleView(): boolean {
    return this.authService.can('callTasks.viewAll') && this.authService.can('callTasks.update');
  }

  /** Updating a task is for its assignee; the overview is read-only. */
  canUpdate(): boolean {
    return this.authService.can('callTasks.update') && !this.viewAll;
  }

  /** Trưởng phòng: the queue of calls whose class has no responsible staff member. */
  get canAssign(): boolean {
    return this.authService.can('classes.assign');
  }
  filterAssignee = '';
  activeStaff: User[] = [];
  assignTo: Record<string, string> = {};

  assignTask(task: CallTask) {
    const staffId = this.assignTo[task._id];
    if (!staffId) return;
    this.callTaskService.assignTask(task._id, staffId).subscribe({
      next: (res) => {
        this.notify.success(res.message);
        this.loadTasks();
      },
      error: (err) => this.notify.error(err.error?.message || 'Không giao được cuộc gọi'),
    });
  }

  setViewAll(value: boolean) {
    this.viewAll = value;
    this.loadTasks();
  }

  ngOnInit(): void {
    this.viewAll = !this.authService.can('callTasks.update');
    if (this.canAssign)
      this.staffService.getStaffList().subscribe({
        next: (list) => {
          this.activeStaff = list.filter((u) => u.role === 'staff' && u.status === 'active');
          this.cdr.markForCheck();
        },
      });
    this.loadTasks();
    this.loadSystemSettings();
  }

  loadSystemSettings() {
    this.settingsService.getSettings().subscribe({
      next: (s) => (this.sysSettings = s),
      error: (err) => console.error('Load settings error:', err),
    });
  }

  loadTasks() {
    const filters = {
      classCode: this.filterClassCode,
      groupCode: this.filterGroupCode,
      status: this.filterStatus,
      assignedTo: this.viewAll ? this.filterAssignee : '',
    };
    (this.viewAll
      ? this.callTaskService.getAllTasks(filters)
      : this.callTaskService.getMyTasks(filters)
    ).subscribe({
      next: (list) => {
        this.tasks = list;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Load call tasks error:', err),
    });
  }

  applyFilters() {
    this.loadTasks();
  }

  get pendingCount() {
    return this.tasks.filter((t) => t.callStatus === CALL_STATUS.PENDING).length;
  }

  get callbackDueCount() {
    return this.tasks.filter((t) => t.isCallbackDue).length;
  }

  get doneCount() {
    return this.tasks.filter((t) => t.callStatus === CALL_STATUS.CONTACTED).length;
  }

  onCallbackDateChange(task: CallTask, dateValue: string) {
    task.callbackDate = dateValue || null;
  }

  saveTaskUpdate(task: CallTask) {
    this.callTaskService
      .updateTaskStatus(task._id, {
        status: task.callStatus,
        callNote: task.callNote,
        absenceReasonCategory: task.absenceReasonCategory,
        callbackDate: task.callbackDate,
        tags: task.student?.tags,
      })
      .subscribe({
        next: (res) => {
          task.callAttempts = res.task.callAttempts;
          // Reload tasks to re-sort by callback & status priority queue
          this.loadTasks();
        },
        error: (err) => this.notify.error(err.error?.message || 'Không thể lưu kết quả cuộc gọi'),
      });
  }

  addTagToStudent(task: CallTask, event: any) {
    const selectedTag = event.target.value;
    if (!selectedTag || !task.student) return;
    if (!task.student.tags) task.student.tags = [];
    if (!task.student.tags.includes(selectedTag)) {
      task.student.tags.push(selectedTag);
      this.callTaskService.updateStudentTags(task.student._id, task.student.tags).subscribe();
    }
    event.target.value = '';
  }

  removeTagFromStudent(task: CallTask, tagToRemove: string) {
    if (!task.student || !task.student.tags) return;
    task.student.tags = task.student.tags.filter((t) => t !== tagToRemove);
    this.callTaskService.updateStudentTags(task.student._id, task.student.tags).subscribe();
  }

  getAiAdvice(task: CallTask) {
    const previous = this.aiAdvice[task._id];
    this.aiAdvice[task._id] = { loading: true, text: previous?.text };
    this.aiService.getCallAdvice(task._id).subscribe({
      next: (res) => (this.aiAdvice[task._id] = { loading: false, text: res.advice }),
      error: (err) =>
        (this.aiAdvice[task._id] = {
          loading: false,
          text: previous?.text,
          error: err.error?.message || 'Không thể lấy gợi ý AI. Vui lòng thử lại.',
        }),
    });
  }

  openStudent360(studentId?: string) {
    if (!studentId) return;
    this.callTaskService.getStudent360Profile(studentId).subscribe({
      next: (profile) => {
        this.student360Data = profile;
        this.show360Modal = true;
      },
      error: (err) => this.notify.error(err.error?.message || 'Không thể lấy hồ sơ 360° sinh viên'),
    });
  }
}
