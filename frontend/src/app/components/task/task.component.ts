import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaskService } from '../../services/task.service';
import { NotificationService } from '../../services/notification.service';
import { WorkTask, TaskStatus, TASK_STATUS } from '../../models/types';
import { ViLabelPipe } from '../../utils/label.pipe';
import {
  countTasksByStatus,
  formatFileSize,
  isTaskOverdue,
  taskProgress,
  taskUserName,
} from '../../utils/task-utils';

interface ProgressDraft {
  percent: number;
  note: string;
}

interface EvidenceDraft {
  note: string;
  link: string;
  files: File[];
}

@Component({
  selector: 'app-task',
  standalone: true,
  imports: [CommonModule, FormsModule, ViLabelPipe],
  templateUrl: './task.component.html',
  styleUrl: './task.component.css',
})
export class TaskComponent implements OnInit {
  tasks: WorkTask[] = [];
  filterStatus: TaskStatus | '' = '';

  /** Status filter pills (icon keys map to inline SVGs in the template). */
  readonly statusFilters: { value: TaskStatus | ''; label: string; icon: string; tone: string }[] = [
    { value: '', label: 'Tất cả', icon: 'all', tone: 'violet' },
    { value: 'moi_giao', label: 'Mới giao', icon: 'new', tone: 'amber' },
    { value: 'da_xac_nhan', label: 'Đã xác nhận', icon: 'play', tone: 'blue' },
    { value: 'cho_duyet', label: 'Chờ duyệt', icon: 'clock', tone: 'purple' },
    { value: 'hoan_thanh', label: 'Hoàn thành', icon: 'done', tone: 'green' },
    { value: 'bi_tu_choi', label: 'Bị từ chối', icon: 'undo', tone: 'rose' },
  ];

  readonly statCards = [
    { label: 'Mới giao', icon: 'new', tone: 'amber', count: () => this.newCount },
    { label: 'Đang thực hiện', icon: 'play', tone: 'blue', count: () => this.inProgressCount },
    { label: 'Chờ duyệt', icon: 'clock', tone: 'purple', count: () => this.waitingCount },
    { label: 'Hoàn thành', icon: 'done', tone: 'green', count: () => this.doneCount },
  ];
  loading = false;

  private drafts = new Map<string, EvidenceDraft>();
  private progressDrafts = new Map<string, ProgressDraft>();
  savingProgress: string | null = null;

  readonly taskUserName = taskUserName;
  readonly isTaskOverdue = isTaskOverdue;
  readonly formatFileSize = formatFileSize;
  readonly taskProgress = taskProgress;

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

  progressDraft(task: WorkTask): ProgressDraft {
    let d = this.progressDrafts.get(task._id);
    if (!d) {
      d = { percent: Math.min(task.progress ?? 0, 99), note: '' };
      this.progressDrafts.set(task._id, d);
    }
    return d;
  }

  saveProgress(task: WorkTask) {
    const d = this.progressDraft(task);
    this.savingProgress = task._id;
    this.taskService.updateProgress(task._id, Math.round(d.percent), d.note.trim()).subscribe({
      next: (res) => {
        Object.assign(task, res.task);
        this.progressDrafts.delete(task._id);
        this.savingProgress = null;
        this.notify.success(res.message);
      },
      error: (err) => {
        this.savingProgress = null;
        this.notify.error(err.error?.message || 'Không thể cập nhật tiến độ');
      },
    });
  }

  /** Newest first, a few entries: enough context without a long history. */
  recentProgress(task: WorkTask) {
    return (task.progressLog ?? []).slice(-3).reverse();
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
