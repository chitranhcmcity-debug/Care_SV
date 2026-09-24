import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CallTaskService } from '../../services/call-task.service';
import { AuthService } from '../../services/auth.service';
import { SettingsService } from '../../services/settings.service';
import { AiService } from '../../services/ai.service';
import { NotificationService } from '../../services/notification.service';
import { CallService, CallTarget } from '../../services/call.service';
import { CallTask, CALL_STATUS, Student360Profile, SystemSettings } from '../../models/types';

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
  ) {}

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

  /** Management sees every staff member's tasks; the manager only has that view. */
  viewAll = false;

  /** Updating a task is for its assignee (or the admin); the manager's overview is read-only. */
  canUpdate(): boolean {
    return !this.viewAll || this.authService.isAdmin();
  }

  setViewAll(value: boolean) {
    this.viewAll = value;
    this.loadTasks();
  }

  ngOnInit(): void {
    this.viewAll = this.authService.isManager();
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
    };
    (this.viewAll
      ? this.callTaskService.getAllTasks(filters)
      : this.callTaskService.getMyTasks(filters)
    ).subscribe({
      next: (list) => (this.tasks = list),
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
