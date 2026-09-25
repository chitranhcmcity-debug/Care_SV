import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
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
// StringeeCall "signalingstate" codes that mean the call is over (busy / ended).
const STRINGEE_ENDED_CODES = new Set([5, 6]);
const STRINGEE_ANSWERED_CODE = 3;

type Step = 'setup' | 'calling' | 'result';

// Minimal typing of the global Stringee Web SDK.
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

/** App-wide call dialog: pick student/parent and method, call, then log the outcome. */
@Component({
  selector: 'app-call-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './call-dialog.component.html',
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
  readonly stringeeAvailable = signal(false);
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
    // Reset whenever a new call request opens the dialog.
    effect(() => {
      const req = this.request();
      if (!req) return;
      this.calls.config().subscribe({
        next: (c) => {
          this.stringeeAvailable.set(c.stringee);
          // Prefer the real switchboard call (recorded) whenever the server supports it.
          if (c.stringee && this.step() === 'setup') this.method.set('stringee');
        },
        error: () => this.stringeeAvailable.set(false),
      });
      this.step.set('setup');
      this.target.set(req.target ?? (req.student.phone ? 'sinh_vien' : 'phu_huynh'));
      this.method.set('dien_thoai');
      this.callLog.set(null);
      this.elapsed.set(0);
      this.stringeeState.set('');
      this.outcome = '';
      this.note = '';
      this.recordingFile = null;
    });
  }

  ngOnDestroy() {
    this.stopTimer();
    this.teardownStringee();
  }

  start() {
    const req = this.request();
    if (!req || !this.selectedPhone() || this.busy() || !this.canStartCall()) return;
    this.busy.set(true);
    this.calls
      .start({
        studentId: req.student._id,
        target: this.target(),
        method: this.method(),
        callTaskId: req.callTaskId,
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

  /** Phone-dialer calls: the user ends the call on the phone, then taps here. */
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

  /** Close without saving an outcome; a started call stays in history as unfinished. */
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

  // ---------------- Stringee (browser → phone through the switchboard) ----------------

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
      // answer_url matches this against the call log before connecting.
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
          this.stringeeState.set('Đã kết nối — đang ghi âm');
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
      /* already ended */
    }
    this.stringeeCall = null;
  }

  private teardownStringee() {
    this.hangupStringee();
    try {
      this.stringeeClient?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.stringeeClient = null;
  }
}
