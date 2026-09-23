import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaskService } from '../../services/task.service';
import { NotificationService } from '../../services/notification.service';
import { WorkTask, TaskStatus, TASK_STATUS } from '../../models/types';
import {
  countTasksByStatus,
  formatFileSize,
  isTaskOverdue,
  taskUserName,
} from '../../utils/task-utils';

interface EvidenceDraft {
  note: string;
  link: string;
  files: File[];
}

@Component({
  selector: 'app-task',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task.component.html',
})
export class TaskComponent implements OnInit {
  tasks: WorkTask[] = [];
  filterStatus: TaskStatus | '' = '';
  loading = false;

  private drafts = new Map<string, EvidenceDraft>();

  readonly taskUserName = taskUserName;
  readonly isTaskOverdue = isTaskOverdue;
  readonly formatFileSize = formatFileSize;

  constructor(
    protected taskService: TaskService,
    private notify: NotificationService,
  ) {}

  ngOnInit(): void {
    this.loadTasks();
  }

  loadTasks() {
    this.loading = true;
    this.taskService.getMyTasks(this.filterStatus || undefined).subscribe({
      next: (list) => {
        this.tasks = list;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.notify.error(err.error?.message || 'Không thể tải danh sách nhiệm vụ');
      },
    });
  }

  get newCount() {
    return countTasksByStatus(this.tasks, TASK_STATUS.PENDING);
  }

  get inProgressCount() {
    return countTasksByStatus(this.tasks, TASK_STATUS.ACKNOWLEDGED, TASK_STATUS.REJECTED);
  }

  get waitingCount() {
    return countTasksByStatus(this.tasks, TASK_STATUS.SUBMITTED);
  }

  get doneCount() {
    return countTasksByStatus(this.tasks, TASK_STATUS.COMPLETED);
  }

  draft(taskId: string): EvidenceDraft {
    let d = this.drafts.get(taskId);
    if (!d) {
      d = { note: '', link: '', files: [] };
      this.drafts.set(taskId, d);
    }
    return d;
  }

  onFilesSelected(taskId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    this.draft(taskId).files = input.files ? Array.from(input.files) : [];
  }

  acknowledge(task: WorkTask) {
    this.taskService.acknowledgeTask(task._id).subscribe({
      next: (res) => {
        Object.assign(task, res.task);
        this.notify.success(res.message);
      },
      error: (err) => this.notify.error(err.error?.message || 'Không thể xác nhận nhiệm vụ'),
    });
  }

  submitEvidence(task: WorkTask) {
    const d = this.draft(task._id);
    if (!d.note.trim() && !d.link.trim() && d.files.length === 0) {
      this.notify.warning(
        'Vui lòng cung cấp ít nhất một minh chứng: ghi chú, link hoặc file',
        'Thiếu minh chứng',
      );
      return;
    }
    this.taskService
      .submitEvidence(task._id, { note: d.note.trim(), link: d.link.trim(), files: d.files })
      .subscribe({
        next: (res) => {
          Object.assign(task, res.task);
          this.drafts.delete(task._id);
          this.notify.success(res.message);
        },
        error: (err) => this.notify.error(err.error?.message || 'Không thể nộp minh chứng'),
      });
  }
}
