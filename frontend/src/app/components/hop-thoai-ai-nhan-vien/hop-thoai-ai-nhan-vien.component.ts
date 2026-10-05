import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiService } from '../../services/ai.service';
import { StaffProgressRow } from '../../models/types';
import { renderMarkdown } from '../../utils/markdown';
import { kpiTone, RATE_PARTS } from '../tien-do-nhan-vien/tien-do-nhan-vien-utils';

/**
 * Trưởng phòng / PHT: AI đánh giá một nhân viên — các số liệu khách quan mà hệ thống
 * đã tính (KPI, tỷ lệ đúng hạn, chất lượng, chăm sóc sinh viên) kèm nhận xét bằng văn bản của AI.
 */
@Component({
  selector: 'app-staff-ai-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hop-thoai-ai-nhan-vien.component.html',
})
export class StaffAiModalComponent implements OnInit {
  private readonly ai = inject(AiService);

  @Input({ required: true }) staffId!: string;
  @Input() staffName = '';
  /** Kỳ tùy chọn (YYYY-MM-DD); rỗng = toàn thời gian. */
  @Input() from = '';
  @Input() to = '';
  @Output() closed = new EventEmitter<void>();

  readonly loading = signal(true);
  readonly metrics = signal<StaffProgressRow | null>(null);
  readonly html = signal('');
  readonly error = signal('');
  readonly rateParts = RATE_PARTS;
  readonly kpiTone = kpiTone;

  ngOnInit() {
    this.ai.getStaffPerformance(this.staffId, { from: this.from, to: this.to }).subscribe({
      next: (res) => {
        this.metrics.set(res.metrics);
        this.html.set(renderMarkdown(res.assessment));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Không thể đánh giá năng lực bằng AI.');
        this.loading.set(false);
      },
    });
  }
}
