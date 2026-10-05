import { Injectable, computed, inject, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';

/** Các request bắt đầu sau khi điều hướng kết thúc khoảng này vẫn tính là lần tải đầu của trang. */
const PAGE_LOAD_WINDOW_MS = 800;
/** Loader chỉ hiện nếu trang vẫn bận sau khoảng trễ này, để các lần tải nhanh không nhấp nháy. */
const SHOW_DELAY_MS = 200;

/**
 * Điều khiển loader logo toàn màn hình: bận khi đang điều hướng (tải trang lazy) hoặc khi
 * các request API mà trang bắn ra lúc mở còn đang chờ. Thăm dò nền và thao tác người dùng bắt đầu
 * sau đó không được tính, nên không bao giờ chặn màn hình.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly navigating = signal(false);
  private readonly pending = signal(0);
  private windowUntil = 0;
  private showTimer?: ReturnType<typeof setTimeout>;

  private readonly busy = computed(() => this.navigating() || this.pending() > 0);
  /** True khi busy đã kéo dài SHOW_DELAY_MS; được overlay loader đọc. */
  readonly visible = signal(false);

  constructor() {
    inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.navigating.set(true);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.windowUntil = Date.now() + PAGE_LOAD_WINDOW_MS;
        this.navigating.set(false);
      }
      this.sync();
    });
  }

  /** Một request bắt đầu lúc này có thuộc lần tải trang hiện tại không. */
  isPageLoad(): boolean {
    return this.navigating() || Date.now() <= this.windowUntil;
  }

  start(): void {
    this.pending.update((n) => n + 1);
    this.sync();
  }

  stop(): void {
    this.pending.update((n) => Math.max(0, n - 1));
    this.sync();
  }

  private sync(): void {
    if (this.busy()) {
      if (!this.visible() && !this.showTimer)
        this.showTimer = setTimeout(() => {
          this.showTimer = undefined;
          if (this.busy()) this.visible.set(true);
        }, SHOW_DELAY_MS);
    } else {
      clearTimeout(this.showTimer);
      this.showTimer = undefined;
      this.visible.set(false);
    }
  }
}
