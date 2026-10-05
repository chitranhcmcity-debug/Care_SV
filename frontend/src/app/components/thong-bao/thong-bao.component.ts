import { Component, HostListener, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, Toast, ToastType } from '../../services/notification.service';

const TONES: Record<ToastType, { icon: string; iconBox: string; bar: string }> = {
  success: {
    icon: 'M5 12l5 5L20 7',
    iconBox: 'bg-emerald-50 text-emerald-600',
    bar: 'bg-emerald-500',
  },
  error: {
    icon: 'M12 8v5m0 3.5h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    iconBox: 'bg-rose-50 text-rose-600',
    bar: 'bg-rose-500',
  },
  warning: {
    icon: 'M12 8v5m0 3.5h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    iconBox: 'bg-amber-50 text-amber-600',
    bar: 'bg-amber-500',
  },
  info: {
    icon: 'M12 11v5m0-8.5h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    iconBox: 'bg-blue-50 text-blue-500',
    bar: 'bg-blue-500',
  },
};

/** Hiển thị toast của NotificationService và hộp thoại xác nhận. Gắn một lần trong app.html. */
@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './thong-bao.component.html',
  styles: `
    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateX(24px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes toast-timer {
      from {
        transform: scaleX(1);
      }
      to {
        transform: scaleX(0);
      }
    }
    @keyframes dialog-in {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.97);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes fade-in {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    .toast-enter {
      animation: toast-in 0.25s ease-out;
    }
    .toast-timer {
      transform-origin: left;
      animation: toast-timer linear forwards;
    }
    .dialog-enter {
      animation: dialog-in 0.2s ease-out;
    }
    .fade-enter {
      animation: fade-in 0.15s ease-out;
    }
  `,
})
export class NotificationsComponent {
  readonly notify = inject(NotificationService);
  readonly tones = TONES;
  readonly trackById = (_: number, toast: Toast) => toast.id;

  constructor() {
    // Chuyển tiêu điểm bàn phím vào mỗi hộp thoại khi mở (ô nhập trước, không có thì nút xác nhận).
    effect(() => {
      if (!this.notify.pendingConfirm()) return;
      setTimeout(() => document.querySelector<HTMLElement>('[data-dialog-autofocus]')?.focus());
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (!this.notify.pendingConfirm()) return;
    if (event.key === 'Escape') this.notify.answerConfirm(false);
    if (event.key === 'Enter') {
      event.preventDefault();
      this.notify.answerConfirm(true);
    }
  }
}
