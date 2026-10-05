import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaskService } from '../../services/task.service';
import { NotificationService } from '../../services/notification.service';
import { StaffProgressRow, TaskCategory, WorkTask } from '../../models/types';
import { ViLabelPipe } from '../../utils/label.pipe';
import { isTaskOverdue, taskProgress } from '../../utils/task-utils';
import { StaffAiModalComponent } from '../hop-thoai-ai-nhan-vien/hop-thoai-ai-nhan-vien.component';
import { kpiTone, rateTone, RATE_PARTS } from './tien-do-nhan-vien-utils';

type PeriodPreset = 'month' | '30d' | 'quarter' | 'year' | 'all' | 'custom';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Trưởng phòng / PHT: mỗi nhân viên đang làm việc được giao thế nào — tiến độ,
 * các mục quá hạn, tỷ lệ đúng hạn, điểm chất lượng, kết quả chăm sóc sinh viên — kèm đánh giá của AI.
 */
@Component({
  selector: 'app-staff-progress',
  standalone: true,
  imports: [CommonModule, FormsModule, ViLabelPipe, StaffAiModalComponent],
  templateUrl: './tien-do-nhan-vien.component.html',
})
export class StaffProgressComponent implements OnInit {
  private readonly taskService = inject(TaskService);
  private readonly notify = inject(NotificationService);

  preset: PeriodPreset = 'month';
  from = '';
  to = '';

  readonly loading = signal(false);
  readonly rows = signal<StaffProgressRow[]>([]);
  readonly expandedId = signal<string | null>(null);
  readonly detailTasks = signal<WorkTask[]>([]);
  readonly detailLoading = signal(false);
  readonly aiTarget = signal<{ id: string; name: string } | null>(null);

  readonly rateParts = RATE_PARTS;
  readonly kpiTone = kpiTone;
  readonly rateTone = rateTone;
  readonly isTaskOverdue = isTaskOverdue;
  readonly taskProgress = taskProgress;

  readonly totals = computed(() => {
    const rows = this.rows();
    const scored = rows.filter((r) => r.kpiScore !== null);
    const sum = (pick: (r: StaffProgressRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
    return {
      staff: rows.length,
      tasks: sum((r) => r.tasks.total),
      completed: sum((r) => r.tasks.completed),
      open: sum((r) => r.tasks.open),
      waitingReview: sum((r) => r.tasks.waitingReview),
      overdue: sum((r) => r.tasks.overdue),
      avgKpi: scored.length
        ? Math.round(scored.reduce((s, r) => s + r.kpiScore!, 0) / scored.length)
        : null,
    };
  });

  ngOnInit() {
    this.applyPreset('month');
  }

  applyPreset(preset: PeriodPreset) {
    this.preset = preset;
    const now = new Date();
    const start = {
      month: new Date(now.getFullYear(), now.getMonth(), 1),
      '30d': new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29),
      quarter: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1),
      year: new Date(now.getFullYear(), 0, 1),
    }[preset as 'month' | '30d' | 'quarter' | 'year'];
    if (preset === 'all') {
      this.from = '';
      this.to = '';
    } else if (start) {
      this.from = ymd(start);
      this.to = ymd(now);
    }
    if (preset !== 'custom') this.load();
  }

  onCustomDate() {
    this.preset = 'custom';
    if (this.from && this.to && this.from > this.to) {
      this.notify.warning('Ngày bắt đầu phải trước ngày kết thúc');
      return;
    }
    this.load();
  }

  load() {
    this.loading.set(true);
    this.taskService.getStaffProgress({ from: this.from, to: this.to }).subscribe({
      next: (res) => {
        this.rows.set(res.staff);
        this.loading.set(false);
        const open = this.expandedId();
        if (open) this.loadDetail(open);
      },
      error: (err) => {
        this.loading.set(false);
        this.notify.error(err.error?.message || 'Không tải được tiến độ nhân viên');
      },
    });
  }

  toggle(row: StaffProgressRow) {
    const id = row.staff._id;
    if (this.expandedId() === id) {
      this.expandedId.set(null);
      return;
    }
    this.expandedId.set(id);
    this.loadDetail(id);
  }

  private loadDetail(staffId: string) {
    this.detailLoading.set(true);
    this.detailTasks.set([]);
    this.taskService.getAllTasks({ assignedTo: staffId }).subscribe({
      next: (list) => {
        // Cùng kỳ với bảng tổng: nhiệm vụ tạo trong [from, to].
        const inPeriod = list.filter((t) => {
          const day = t.createdAt ? ymd(new Date(t.createdAt)) : '';
          return (!this.from || day >= this.from) && (!this.to || day <= this.to);
        });
        this.detailTasks.set(inPeriod);
        this.detailLoading.set(false);
      },
      error: () => this.detailLoading.set(false),
    });
  }

  categories(row: StaffProgressRow) {
    return (
      Object.entries(row.tasks.byCategory) as [TaskCategory, { total: number; completed: number }][]
    ).sort((a, b) => b[1].total - a[1].total);
  }

  openAi(row: StaffProgressRow) {
    this.aiTarget.set({ id: row.staff._id, name: row.staff.fullName });
  }
}
