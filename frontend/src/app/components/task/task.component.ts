import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaskService } from '../../services/task.service';
import { WorkTask, TaskStatus, TaskEvidenceFile } from '../../models/types';

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

  constructor(private taskService: TaskService) {}

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
        alert(err.error?.message || 'Không thể tải danh sách nhiệm vụ');
      },
    });
  }

  applyFilter() {
    this.loadTasks();
  }

  get newCount() {
    return this.tasks.filter((t) => t.status === 'Mới giao').length;
  }

  get inProgressCount() {
    return this.tasks.filter((t) => t.status === 'Đã xác nhận' || t.status === 'Bị từ chối').length;
  }

  get waitingCount() {
    return this.tasks.filter((t) => t.status === 'Chờ duyệt').length;
  }

  get doneCount() {
    return this.tasks.filter((t) => t.status === 'Hoàn thành').length;
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

  displayUser(u: { fullName: string; email: string } | string | null | undefined): string {
    if (!u) return '—';
    return typeof u === 'string' ? u : u.fullName;
  }

  isOverdue(task: WorkTask): boolean {
    if (!task.dueDate) return false;
    if (task.status === 'Hoàn thành') return false;
    return new Date(task.dueDate).getTime() < Date.now();
  }

  acknowledge(task: WorkTask) {
    this.taskService.acknowledgeTask(task._id).subscribe({
      next: (res) => Object.assign(task, res.task),
      error: (err) => alert(err.error?.message || 'Không thể xác nhận nhiệm vụ'),
    });
  }

  submitEvidence(task: WorkTask) {
    const d = this.draft(task._id);
    if (!d.note.trim() && !d.link.trim() && d.files.length === 0) {
      alert('Vui lòng cung cấp ít nhất một minh chứng: ghi chú, link hoặc file');
      return;
    }
    this.taskService
      .submitEvidence(task._id, { note: d.note.trim(), link: d.link.trim(), files: d.files })
      .subscribe({
        next: (res) => {
          Object.assign(task, res.task);
          this.drafts.delete(task._id);
        },
        error: (err) => alert(err.error?.message || 'Không thể nộp minh chứng'),
      });
  }

  viewFile(taskId: string, file: TaskEvidenceFile) {
    this.taskService.getEvidenceBlob(taskId, file._id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: () => alert('Không thể tải tệp minh chứng'),
    });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
