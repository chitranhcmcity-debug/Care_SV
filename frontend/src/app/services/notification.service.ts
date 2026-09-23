import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message: string;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** Red confirm button for destructive actions (delete, reset…). */
  danger?: boolean;
}

export interface PromptOptions extends ConfirmOptions {
  placeholder?: string;
  inputType?: 'text' | 'password';
}

interface ConfirmRequest extends Required<Omit<ConfirmOptions, 'message'>> {
  message: string;
  /** Present when the dialog asks for a value (prompt). */
  input?: { placeholder: string; type: 'text' | 'password' };
  resolve: (ok: boolean) => void;
}

const DEFAULT_TITLES: Record<ToastType, string> = {
  success: 'Thành công',
  error: 'Có lỗi xảy ra',
  warning: 'Lưu ý',
  info: 'Thông báo',
};

/**
 * App-wide replacement for window.alert / window.confirm, rendered by
 * <app-notifications> (mounted once in app.html).
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly toasts = signal<Toast[]>([]);
  readonly pendingConfirm = signal<ConfirmRequest | null>(null);
  /** Value typed into a prompt dialog. */
  readonly promptValue = signal('');
  private nextId = 0;

  show(type: ToastType, message: string, title = DEFAULT_TITLES[type]) {
    const toast: Toast = { id: ++this.nextId, type, title, message };
    // Keep at most 4 on screen; newest at the top.
    this.toasts.update((list) => [toast, ...list].slice(0, 4));
    setTimeout(() => this.dismiss(toast.id), type === 'error' ? 7000 : 4500);
  }

  success(message: string, title?: string) {
    this.show('success', message, title);
  }

  error(message: string, title?: string) {
    this.show('error', message, title);
  }

  warning(message: string, title?: string) {
    this.show('warning', message, title);
  }

  info(message: string, title?: string) {
    this.show('info', message, title);
  }

  dismiss(id: number) {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  /** Styled confirm dialog; resolves true when the user confirms. */
  confirm(options: ConfirmOptions): Promise<boolean> {
    return this.open(options);
  }

  /** Styled prompt dialog; resolves the typed value, or null when cancelled. */
  async prompt(options: PromptOptions): Promise<string | null> {
    const { placeholder = '', inputType = 'text', ...rest } = options;
    this.promptValue.set('');
    const ok = await this.open(rest, { placeholder, type: inputType });
    return ok ? this.promptValue() : null;
  }

  private open(options: ConfirmOptions, input?: ConfirmRequest['input']): Promise<boolean> {
    // A newer dialog replaces (and cancels) any dialog still open.
    this.pendingConfirm()?.resolve(false);
    return new Promise((resolve) =>
      this.pendingConfirm.set({
        message: '',
        confirmText: 'Xác nhận',
        cancelText: 'Hủy',
        danger: false,
        ...options,
        input,
        resolve,
      }),
    );
  }

  answerConfirm(ok: boolean) {
    const request = this.pendingConfirm();
    this.pendingConfirm.set(null);
    request?.resolve(ok);
  }
}
