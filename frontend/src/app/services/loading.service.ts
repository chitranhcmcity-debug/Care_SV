import { Injectable, computed, inject, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';

/** Requests started this long after a navigation ends still count as the page's initial load. */
const PAGE_LOAD_WINDOW_MS = 800;
/** Loader appears only if the page is still busy after this delay, so fast loads don't flash. */
const SHOW_DELAY_MS = 200;

/**
 * Drives the full-screen logo loader: busy while a navigation runs (lazy page download) or while
 * the API requests a page fires on open are pending. Background polling and user actions started
 * later are not counted, so they never block the screen.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly navigating = signal(false);
  private readonly pending = signal(0);
  private windowUntil = 0;
  private showTimer?: ReturnType<typeof setTimeout>;

  private readonly busy = computed(() => this.navigating() || this.pending() > 0);
  /** True once busy has lasted SHOW_DELAY_MS; read by the loader overlay. */
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

  /** Whether a request starting now belongs to the current page load. */
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
