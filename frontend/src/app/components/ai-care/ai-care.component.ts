import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AiCareAction, AiCareProfile, AiService, ChatMessage } from '../../services/ai.service';
import { AuthService } from '../../services/auth.service';

/** A prepared action shown as a card with Xác nhận / Hủy. */
type ActionCard = AiCareAction & {
  state: 'pending' | 'running' | 'done' | 'cancelled' | 'error';
  result?: string;
};
import { renderMarkdown } from '../../utils/markdown';

const MAX_HISTORY = 20; // matches the backend limit
// Robot launcher size in px (keep in sync with .robot-launcher in the CSS).
const ROBOT_W = 96;
const ROBOT_H = 80;
// How long the robot stays where the user dropped it before it wanders again.
const DROP_REST_MS = 8000;

/** AI Care: floating assistant available on every signed-in page; what it can do depends on role. */
@Component({
  selector: 'app-ai-care',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-care.component.html',
  styleUrl: './ai-care.component.css',
})
export class AiCareComponent {
  private readonly ai = inject(AiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @ViewChild('scroller') private scroller?: ElementRef<HTMLElement>;

  // --- Robot wandering: flies to a random spot, hovers a moment, repeats. It parks in the
  // bottom-right corner while the chat is open, pauses under the pointer, and stays parked
  // for users who prefer reduced motion.
  readonly pos = signal(this.homePosition());
  readonly travelMs = signal(0);
  readonly tilt = signal(0);
  readonly flying = signal(false);
  /** Which way the robot faces; it starts at its home spot, looking into the page. */
  readonly facing = signal<'left' | 'right'>(
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 'right' : 'left',
  );
  private wanderTimer?: ReturnType<typeof setTimeout>;
  private paused = false;
  // Drag to move: the robot rests where it is dropped, then goes back to wandering.
  readonly dragging = signal(false);
  private drag: {
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null = null;
  private suppressClick = false;
  private restUntil = 0;
  private readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  readonly open = signal(false);
  readonly profile = signal<AiCareProfile | null>(null);
  readonly messages = signal<(ChatMessage & { html?: string; actions?: ActionCard[] })[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  draft = '';

  constructor() {
    // A different account signing in on this tab must not see the previous conversation.
    // Session refreshes re-set the same user, so only clear when the account actually changes.
    const idOf = (u: { id?: string; _id?: string } | null) => u?.id ?? u?._id;
    let userId = idOf(this.auth.currentUser());
    effect(() => {
      const id = idOf(this.auth.currentUser());
      if (id === userId) return;
      userId = id;
      this.messages.set([]);
      this.profile.set(null);
      this.error.set('');
    });
    this.scheduleWander(8000); // rest at the home spot first
    inject(DestroyRef).onDestroy(() => clearTimeout(this.wanderTimer));
  }

  @HostListener('window:resize')
  onResize() {
    // Keep the robot on screen when the window shrinks.
    const { maxX, maxY } = this.bounds();
    this.travelMs.set(0);
    if (this.open()) this.pos.set(this.dockPosition());
    else this.pos.update(({ x, y }) => ({ x: Math.min(x, maxX), y: Math.min(y, maxY) }));
  }

  onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    const { x, y } = this.pos();
    this.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: x,
      originY: y,
      moved: false,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onPointerMove(event: PointerEvent) {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    // A few pixels of jitter is still a click.
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      clearTimeout(this.wanderTimer);
      this.dragging.set(true);
      this.flying.set(false);
      this.tilt.set(0);
      this.travelMs.set(0);
    }
    if (Math.abs(event.movementX) > 1) this.facing.set(event.movementX > 0 ? 'right' : 'left');
    const { minX, minY, maxX, maxY } = this.bounds();
    this.pos.set({
      x: Math.min(maxX, Math.max(minX, drag.originX + dx)),
      y: Math.min(maxY, Math.max(minY, drag.originY + dy)),
    });
  }

  onPointerUp(event: PointerEvent) {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.drag = null;
    if (!drag.moved) return; // a plain click: (click) opens the chat
    this.dragging.set(false);
    this.suppressClick = true; // the click fired after a drag must not open the chat
    // Rest where it was dropped for a while, then carry on wandering.
    this.restUntil = Date.now() + DROP_REST_MS;
    this.scheduleWander(DROP_REST_MS);
  }

  onClick() {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    this.toggle();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.open()) this.toggle();
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange() {
    if (document.hidden) clearTimeout(this.wanderTimer);
    else this.scheduleWander(800);
  }

  pause() {
    this.paused = true;
    clearTimeout(this.wanderTimer);
  }

  resume() {
    this.paused = false;
    this.scheduleWander(1200);
  }

  private bounds() {
    const margin = 12;
    return {
      minX: margin,
      minY: 72, // below the top header
      maxX: Math.max(margin, window.innerWidth - ROBOT_W - margin),
      maxY: Math.max(72, window.innerHeight - ROBOT_H - margin - 10),
    };
  }

  /** Default resting spot: bottom of the left sidebar on desktop, the dock on phones. */
  private homePosition() {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    if (window.innerWidth < 768) return this.dockPosition();
    return { x: 24, y: Math.max(72, window.innerHeight - ROBOT_H - 24) };
  }

  private dockPosition() {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    return {
      x: Math.max(12, window.innerWidth - ROBOT_W - 16),
      y: Math.max(72, window.innerHeight - ROBOT_H - 20),
    };
  }

  private flyTo(target: { x: number; y: number }, speed = 170) {
    const { x, y } = this.pos();
    const distance = Math.hypot(target.x - x, target.y - y);
    const ms = Math.round(Math.min(6000, Math.max(900, (distance / speed) * 1000)));
    const sideways = Math.abs(target.x - x) >= 20;
    // Mostly vertical hops keep the current facing, so the robot does not flip back and forth.
    if (sideways) this.facing.set(target.x > x ? 'right' : 'left');
    this.tilt.set(sideways ? (target.x > x ? 6 : -6) : 0);
    this.flying.set(true);
    this.travelMs.set(ms);
    this.pos.set(target);
    return ms;
  }

  private scheduleWander(delay: number) {
    clearTimeout(this.wanderTimer);
    if (this.reducedMotion || this.paused || this.open() || this.drag) return;
    delay = Math.max(delay, this.restUntil - Date.now());
    this.wanderTimer = setTimeout(() => {
      const { minX, minY, maxX, maxY } = this.bounds();
      const ms = this.flyTo({
        x: Math.round(minX + Math.random() * (maxX - minX)),
        y: Math.round(minY + Math.random() * (maxY - minY)),
      });
      this.wanderTimer = setTimeout(() => {
        this.flying.set(false);
        this.tilt.set(0);
        this.scheduleWander(2500 + Math.random() * 3500); // hover in place for a while
      }, ms);
    }, delay);
  }

  toggle() {
    this.open.update((v) => !v);
    clearTimeout(this.wanderTimer);
    if (this.open()) {
      // Park next to the chat panel.
      const ms = this.flyTo(this.dockPosition(), 900);
      this.wanderTimer = setTimeout(() => {
        this.flying.set(false);
        this.tilt.set(0);
      }, ms);
    } else {
      // Go back to the resting spot, stay a while, then start wandering again.
      const ms = this.flyTo(this.homePosition(), 900);
      this.wanderTimer = setTimeout(() => {
        this.flying.set(false);
        this.tilt.set(0);
        this.scheduleWander(8000);
      }, ms);
    }
    if (this.open() && !this.profile()) {
      this.ai.getCareProfile().subscribe({
        next: (p) => this.profile.set(p),
        error: () => this.error.set('Không tải được thông tin AI Care.'),
      });
    }
  }

  reset() {
    this.messages.set([]);
    this.error.set('');
  }

  send(text = this.draft) {
    const content = text.trim();
    if (!content || this.loading()) return;
    this.draft = '';
    this.error.set('');
    this.messages.update((m) => [...m, { role: 'user', content }]);
    this.scrollToEnd();
    this.loading.set(true);
    const history = this.messages()
      .slice(-MAX_HISTORY)
      .map(({ role, content }) => ({ role, content }));
    // The backend requires the history to start with a user turn.
    while (history.length && history[0].role !== 'user') history.shift();
    this.ai.careChat(history).subscribe({
      next: ({ reply, actions, navigate }) => {
        this.loading.set(false);
        this.messages.update((m) => [
          ...m,
          {
            role: 'assistant',
            content: reply,
            html: renderMarkdown(reply),
            actions: (actions ?? []).map((a) => ({ ...a, state: 'pending' as const })),
          },
        ]);
        if (navigate) this.openPage(navigate);
        this.scrollToEnd();
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        // Drop the unanswered question so the history keeps alternating user/assistant.
        this.messages.update((m) => m.slice(0, -1));
        this.draft = content;
        this.error.set(err.error?.message || 'AI Care đang bận, vui lòng thử lại.');
      },
    });
  }

  /** Runs a prepared action (the user pressed Xác nhận) and shows the result on its card. */
  confirmAction(card: ActionCard) {
    if (card.state !== 'pending') return;
    this.setCard(card.id, { state: 'running' });
    this.ai.confirmCareAction(card.id).subscribe({
      next: ({ message, navigate }) => {
        const samePage = navigate && this.router.url === navigate;
        this.setCard(card.id, {
          state: 'done',
          result: samePage ? `${message} Tải lại trang để thấy thay đổi.` : message,
        });
        // Take the user to the page that shows the change.
        if (navigate && !samePage) this.openPage(navigate);
      },
      error: (err: HttpErrorResponse) =>
        this.setCard(card.id, {
          state: 'error',
          result: err.error?.message || 'Không thực hiện được thao tác.',
        }),
    });
  }

  cancelAction(card: ActionCard) {
    if (card.state !== 'pending') return;
    this.setCard(card.id, { state: 'cancelled' });
    this.ai.cancelCareAction(card.id).subscribe({ error: () => {} });
  }

  private setCard(id: string, patch: Partial<ActionCard>) {
    this.messages.update((list) =>
      list.map((m) =>
        m.actions?.some((a) => a.id === id)
          ? { ...m, actions: m.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) }
          : m,
      ),
    );
  }

  /** Opens a page AI Care pointed to, if this user may open it. */
  private openPage(url: string) {
    if (this.auth.canOpen(url.split('?')[0])) this.router.navigateByUrl(url);
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  private scrollToEnd() {
    setTimeout(() => {
      const el = this.scroller?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
