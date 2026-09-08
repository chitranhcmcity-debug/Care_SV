import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CallTaskService } from '../../services/call-task.service';
import { AuthService } from '../../services/auth.service';
import { SettingsService } from '../../services/settings.service';
import { CallTask, Student360Profile, SystemSettings } from '../../models/types';

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

  constructor(
    private callTaskService: CallTaskService,
    private settingsService: SettingsService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
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
    this.callTaskService
      .getMyTasks({
        classCode: this.filterClassCode,
        groupCode: this.filterGroupCode,
        status: this.filterStatus,
      })
      .subscribe({
        next: (list) => (this.tasks = list),
        error: (err) => console.error('Load call tasks error:', err),
      });
  }

  applyFilters() {
    this.loadTasks();
  }

  get pendingCount() {
    return this.tasks.filter((t) => t.callStatus === 'Chưa gọi').length;
  }

  get callbackDueCount() {
    return this.tasks.filter((t) => t.isCallbackDue).length;
  }

  get doneCount() {
    return this.tasks.filter((t) => t.callStatus === 'Đã liên hệ').length;
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
        error: (err) => alert(err.error?.message || 'Không thể lưu kết quả cuộc gọi'),
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

  openStudent360(studentId?: string) {
    if (!studentId) return;
    this.callTaskService.getStudent360Profile(studentId).subscribe({
      next: (profile) => {
        this.student360Data = profile;
        this.show360Modal = true;
      },
      error: (err) => alert(err.error?.message || 'Không thể lấy hồ sơ 360° sinh viên'),
    });
  }
}
