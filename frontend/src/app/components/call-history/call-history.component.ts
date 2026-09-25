import { Component, OnDestroy, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CALL_OUTCOME_LABELS, CallLog, CallService } from '../../services/call.service';
import { NotificationService } from '../../services/notification.service';

const PAGE_SIZE = 20;

/** The signed-in user's own call log, with recordings. */
@Component({
  selector: 'app-call-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './call-history.component.html',
})
export class CallHistoryComponent implements OnDestroy {
  private readonly calls = inject(CallService);
  private readonly notify = inject(NotificationService);

  readonly items = signal<CallLog[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  /** Call whose recording is loaded into the player, and its object URL. */
  readonly playing = signal<{ id: string; url: string } | null>(null);
  readonly loadingRecording = signal<string | null>(null);
  readonly uploading = signal<string | null>(null);
  readonly outcomeLabels: Record<string, string> = CALL_OUTCOME_LABELS;

  constructor() {
    // First load, and again whenever a call is saved from the dialog.
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
    this.calls.list({ page, limit: PAGE_SIZE }).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  student(call: CallLog) {
    return typeof call.studentId === 'string' ? null : call.studentId;
  }

  formatDuration(sec: number): string {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  /** Recordings need our auth header, so fetch as a Blob and play it from an object URL. */
  play(call: CallLog) {
    this.loadingRecording.set(call._id);
    this.calls.recording(call._id).subscribe({
      next: (blob) => {
        this.releasePlayer();
        this.playing.set({ id: call._id, url: URL.createObjectURL(blob) });
        this.loadingRecording.set(null);
        if (!call.recording) this.load(this.page()); // Stringee recording just got fetched
      },
      error: (err) => {
        this.loadingRecording.set(null);
        // Blob responses carry the JSON error as a Blob; show a sensible message either way.
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
