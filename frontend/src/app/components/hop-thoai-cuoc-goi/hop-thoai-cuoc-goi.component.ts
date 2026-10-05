import { Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CALL_OUTCOME_LABELS,
  CallLog,
  CallMethod,
  CallOutcome,
  CallService,
  CallTarget,
} from '../../services/call.service';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';

const STRINGEE_SDK_URL = 'https://cdn.stringee.com/sdk/web/latest/stringee-web-sdk.min.js';
// Các mã "signalingstate" của StringeeCall nghĩa là cuộc gọi đã kết thúc (bận / đã kết thúc).
const STRINGEE_ENDED_CODES = new Set([5, 6]);
const STRINGEE_ANSWERED_CODE = 3;

type Step = 'setup' | 'calling' | 'result';

// Khai báo kiểu tối giản cho Stringee Web SDK toàn cục.
declare const StringeeClient: new () => {
  connect(token: string): void;
  disconnect(): void;
  on(event: string, cb: (...args: any[]) => void): void;
};
declare const StringeeCall: new (
  client: unknown,
  from: string,
  to: string,
  video: boolean,
) => {
  custom: string;
  callId?: string;
  makeCall(cb: (res: { r: number; message?: string; callId?: string }) => void): void;
  hangup(cb?: () => void): void;
  on(event: string, cb: (...args: any[]) => void): void;
};

let sdkPromise: Promise<void> | null = null;
function loadStringeeSdk(): Promise<void> {
  sdkPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = STRINGEE_SDK_URL;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error('Không tải được thư viện Stringee'));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

/** Hộp thoại gọi toàn ứng dụng: chọn sinh viên/phụ huynh và phương thức, gọi, rồi ghi kết quả. */
@Component({
  selector: 'app-call-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './hop-thoai-cuoc-goi.component.html',
  styleUrl: './hop-thoai-cuoc-goi.component.css',
})
export class CallDialogComponent implements OnDestroy {
  readonly calls = inject(CallService);
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);
  readonly canStartCall = computed(() =>
    ['manager', 'staff', 'teacher'].includes(this.auth.currentUser()?.role ?? ''),
  );

  readonly request = this.calls.request;
  readonly outcomes = Object.entries(CALL_OUTCOME_LABELS) as [Exclude<CallOutcome, ''>, string][];

  readonly step = signal<Step>('setup');
  readonly target = signal<CallTarget>('sinh_vien');
  readonly method = signal<CallMethod>('dien_thoai');
  /** Hỏi trước mỗi cuộc gọi; không ghi âm gì trừ khi người gọi đồng ý. */
  readonly record = signal<boolean | null>(null);
  readonly stringeeAvailable = signal(false);
  /** Chữ cái đại diện: từ đầu và từ cuối của tên sinh viên. */
  readonly initials = computed(() => {
    const words = (this.request()?.student.fullName ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    const first = words[0][0];
    return (words.length > 1 ? first + words[words.length - 1][0] : first).toUpperCase();
  });
  readonly busy = signal(false);
  readonly callLog = signal<CallLog | null>(null);
  readonly phoneNumber = signal('');
  readonly elapsed = signal(0);
  readonly stringeeState = signal('');
  outcome: CallOutcome = '';
  note = '';
  recordingFile: File | null = null;

  readonly selectedPhone = computed(() => {
    const s = this.request()?.student;
    return (this.target() === 'phu_huynh' ? s?.parentPhone : s?.phone) || '';
  });

  private timer: ReturnType<typeof setInterval> | null = null;
  private answeredAt = 0;
  private stringeeClient: InstanceType<typeof StringeeClient> | null = null;
  private stringeeCall: InstanceType<typeof StringeeCall> | null = null;
  private stringeeCallId = '';

  constructor() {
    // Đặt lại mỗi khi một yêu cầu gọi mới mở hộp thoại.
    effect(() => {
      const req = this.request();
      if (!req) return;
      this.step.set('setup');
      this.target.set(req.target ?? (req.student.phone ? 'sinh_vien' : 'phu_huynh'));
      this.method.set('dien_thoai');
      this.record.set(null);
      this.callLog.set(null);
      this.elapsed.set(0);
      this.stringeeState.set('');
      this.outcome = '';
      this.note = '';
      this.recordingFile = null;
      // Sau lần đặt lại ở trên: cấu hình đã cache trả lời đồng bộ ở các lần mở sau.
      untracked(() =>
        this.calls.config().subscribe({
          next: (c) => {
            this.stringeeAvailable.set(c.stringee);
            // Ưu tiên gọi qua tổng đài bất cứ khi nào máy chủ hỗ trợ.
            if (c.stringee && this.step() === 'setup') this.method.set('stringee');
          },
          error: () => this.stringeeAvailable.set(false),
        }),
      );
    });
  }

  ngOnDestroy() {
    this.stopTimer();
    this.teardownStringee();
  }

  start() {
    const req = this.request();
    const record = this.record();
    if (!req || !this.selectedPhone() || this.busy() || !this.canStartCall() || record === null)
      return;
    this.busy.set(true);
    this.calls
      .start({
        studentId: req.student._id,
        target: this.target(),
        method: this.method(),
        record,
        careCaseId: req.careCaseId,
        courseGroupId: req.courseGroupId,
      })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.callLog.set(res.call);
          this.phoneNumber.set(res.phoneNumber);
          this.step.set('calling');
          if (res.stringee) this.startStringee(res.call._id, res.stringee);
          else {
            this.startTimer();
            window.location.href = 'tel:' + res.phoneNumber.replace(/[^\d+]/g, '');
          }
        },
        error: (err) => {
          this.busy.set(false);
          this.notify.error(err.error?.message || 'Không bắt đầu được cuộc gọi');
        },
      });
  }

  /** Cuộc gọi qua bàn phím điện thoại: người dùng kết thúc cuộc gọi trên điện thoại, rồi bấm vào đây. */
  finishCalling() {
    this.stopTimer();
    this.hangupStringee();
    this.step.set('result');
  }

  onFile(event: Event) {
    this.recordingFile = (event.target as HTMLInputElement).files?.[0] ?? null;
  }

  save() {
    const log = this.callLog();
    if (!log || this.busy()) return;
    this.busy.set(true);
    this.calls
      .end(log._id, {
        outcome: this.outcome,
        note: this.note,
        durationSec: this.elapsed(),
        stringeeCallId: this.stringeeCallId || undefined,
      })
      .subscribe({
        next: () => {
          if (!this.recordingFile) return this.done('Đã lưu cuộc gọi vào lịch sử.');
          this.calls.uploadRecording(log._id, this.recordingFile).subscribe({
            next: () => this.done('Đã lưu cuộc gọi và bản ghi âm.'),
            error: (err) => {
              this.busy.set(false);
              this.notify.error(
                (err.error?.message || 'Không tải được file ghi âm') +
                  ' — cuộc gọi vẫn đã được lưu, bạn có thể tải file lại trong Lịch sử cuộc gọi.',
              );
            },
          });
        },
        error: (err) => {
          this.busy.set(false);
          this.notify.error(err.error?.message || 'Không lưu được cuộc gọi');
        },
      });
  }

  /** Đóng mà không lưu kết quả; cuộc gọi đã bắt đầu vẫn nằm trong lịch sử ở dạng chưa hoàn tất. */
  close() {
    this.stopTimer();
    this.teardownStringee();
    this.busy.set(false);
    this.calls.close();
  }

  formatElapsed(): string {
    const s = this.elapsed();
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  private done(message: string) {
    this.busy.set(false);
    this.notify.success(message);
    this.calls.savedVersion.update((v) => v + 1);
    this.calls.close();
  }

  private startTimer() {
    this.stopTimer();
    this.answeredAt = Date.now();
    this.timer = setInterval(
      () => this.elapsed.set(Math.round((Date.now() - this.answeredAt) / 1000)),
      1000,
    );
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ---------------- Stringee (trình duyệt → điện thoại qua tổng đài) ----------------

  private async startStringee(
    callLogId: string,
    cfg: { accessToken: string; from: string; to: string },
  ) {
    this.stringeeState.set('Đang kết nối tổng đài...');
    try {
      await loadStringeeSdk();
    } catch (error) {
      this.stringeeState.set((error as Error).message);
      return;
    }
    const client = new StringeeClient();
    this.stringeeClient = client;
    client.on('authen', (res: { r: number; message?: string }) => {
      if (res.r !== 0) return this.stringeeState.set(`Tổng đài từ chối: ${res.message || res.r}`);
      const call = new StringeeCall(client, cfg.from, cfg.to, false);
      this.stringeeCall = call;
      // answer_url đối chiếu giá trị này với bản ghi cuộc gọi trước khi kết nối.
      call.custom = JSON.stringify({ callLogId });
      call.on('addremotestream', (stream: MediaStream) => {
        const audio = document.getElementById('stringee-remote-audio') as HTMLAudioElement | null;
        if (audio) {
          audio.srcObject = stream;
          audio.play().catch(() => {});
        }
      });
      call.on('signalingstate', (state: { code: number; reason?: string }) => {
        if (state.code === STRINGEE_ANSWERED_CODE) {
          this.stringeeState.set(this.record() ? 'Đã kết nối — đang ghi âm' : 'Đã kết nối');
          this.startTimer();
        } else if (STRINGEE_ENDED_CODES.has(state.code)) {
          this.stringeeState.set(state.reason || 'Cuộc gọi đã kết thúc');
          this.finishCalling();
        } else if (state.reason) this.stringeeState.set(state.reason);
      });
      call.makeCall((res) => {
        if (res.r !== 0) {
          this.stringeeState.set(`Không gọi được: ${res.message || res.r}`);
          return;
        }
        this.stringeeCallId = res.callId || call.callId || '';
        this.stringeeState.set('Đang đổ chuông...');
      });
    });
    client.connect(cfg.accessToken);
  }

  private hangupStringee() {
    try {
      this.stringeeCall?.hangup();
    } catch {
      /* đã kết thúc */
    }
    this.stringeeCall = null;
  }

  private teardownStringee() {
    this.hangupStringee();
    try {
      this.stringeeClient?.disconnect();
    } catch {
      /* đã ngắt kết nối */
    }
    this.stringeeClient = null;
  }
}
