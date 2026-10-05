import { Component, OnDestroy, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CALL_OUTCOME_LABELS, CallLog, CallService } from '../../services/call.service';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';

const PAGE_SIZE = 20;

/** Nhật ký cuộc gọi của người dùng đang đăng nhập kèm ghi âm; Trưởng phòng / PHT có thể chuyển sang xem của mọi người. */
@Component({
  selector: 'app-call-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lich-su-cuoc-goi.component.html',
  styleUrl: './lich-su-cuoc-goi.component.css',
})
export class CallHistoryComponent implements OnDestroy {
  private readonly calls = inject(CallService);
  private readonly notify = inject(NotificationService);

  readonly items = signal<CallLog[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  /** Cuộc gọi có bản ghi âm đang nạp vào trình phát, và object URL của nó. */
  readonly playing = signal<{ id: string; url: string } | null>(null);
  readonly loadingRecording = signal<string | null>(null);
  readonly uploading = signal<string | null>(null);
  readonly outcomeLabels: Record<string, string> = CALL_OUTCOME_LABELS;
  /** recordings.viewAll: được liệt kê và nghe mọi cuộc gọi. */
  readonly canViewAll = inject(AuthService).can('recordings.viewAll');
  readonly showAll = signal(false);

  constructor() {
    // Lần nạp đầu, và nạp lại mỗi khi một cuộc gọi được lưu từ hộp thoại.
    effect(() => {
      this.calls.savedVersion();
      untracked(() => this.load(this.page()));
    });
  }

  ngOnDestroy() {
    this.releasePlayer();
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
  }

  load(page: number) {
    this.loading.set(true);
    this.page.set(page);
    this.calls
      .list({ page, limit: PAGE_SIZE, scope: this.showAll() ? 'all' : undefined })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  setShowAll(value: boolean) {
    this.showAll.set(value);
    this.load(1);
  }

  callerName(call: CallLog): string {
    return typeof call.callerId === 'string' ? '' : call.callerId.fullName;
  }

  student(call: CallLog) {
    return typeof call.studentId === 'string' ? null : call.studentId;
  }

  /** "Phạm Bảo Mai" → "PM". */
  initials(name = ''): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  }

  formatDuration(sec: number): string {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  /** Bản ghi âm cần header xác thực của ta, nên tải dạng Blob và phát từ object URL. */
  play(call: CallLog) {
    this.loadingRecording.set(call._id);
    this.calls.recording(call._id).subscribe({
      next: (blob) => {
        this.releasePlayer();
        this.playing.set({ id: call._id, url: URL.createObjectURL(blob) });
        this.loadingRecording.set(null);
        if (!call.recording) this.load(this.page()); // Bản ghi âm Stringee vừa được tải về
      },
      error: (err) => {
        this.loadingRecording.set(null);
        // Phản hồi Blob mang lỗi JSON dưới dạng Blob; hiện thông báo hợp lý trong cả hai trường hợp.
        this.notify.info(
          err.status === 404
            ? 'Cuộc gọi chưa có bản ghi âm (bản ghi của tổng đài có thể cần thêm ít phút).'
            : 'Không tải được bản ghi âm.',
        );
      },
    });
  }

  upload(call: CallLog, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploading.set(call._id);
    this.calls.uploadRecording(call._id, file).subscribe({
      next: () => {
        this.uploading.set(null);
        this.notify.success('Đã tải bản ghi âm lên.');
        this.load(this.page());
      },
      error: (err) => {
        this.uploading.set(null);
        this.notify.error(err.error?.message || 'Không tải được file ghi âm');
      },
    });
  }

  private releasePlayer() {
    const current = this.playing();
    if (current) URL.revokeObjectURL(current.url);
    this.playing.set(null);
  }
}
