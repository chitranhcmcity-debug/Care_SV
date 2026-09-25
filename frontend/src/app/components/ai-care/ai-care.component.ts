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
import { AiCareProfile, AiService, ChatMessage } from '../../services/ai.service';
import { AuthService } from '../../services/auth.service';

const MAX_HISTORY = 20; // matches the backend limit
// Robot launcher size in px (keep in sync with .robot-launcher in the CSS).
const ROBOT_W = 92;
const ROBOT_H = 105;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Minimal, safe markdown: escapes everything first, then bold, inline code, lists and tables. */
function renderMarkdown(text: string): string {
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="px-1 rounded bg-slate-100 text-[0.85em]">$1</code>');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let table: string[][] | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const closeTable = () => {
    if (!table) return;
    const [head, ...rows] = table;
    out.push(
      '<div class="overflow-x-auto my-2"><table class="text-xs border-collapse w-full">' +
        `<thead><tr>${head.map((c) => `<th class="border border-slate-200 bg-slate-50 px-2 py-1 text-left">${inline(c)}</th>`).join('')}</tr></thead>` +
        `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td class="border border-slate-200 px-2 py-1">${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
    );
    table = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^\|.*\|$/.test(line)) {
      closeList();
      if (/^\|[\s:|-]+\|$/.test(line)) continue; // separator row
      (table ??= []).push(
        line
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim()),
      );
      continue;
    }
    closeTable();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        list = kind;
        out.push(
          kind === 'ul'
            ? '<ul class="list-disc pl-5 space-y-0.5">'
            : '<ol class="list-decimal pl-5 space-y-0.5">',
        );
      }
      out.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
      continue;
    }
    closeList();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) out.push(`<p class="font-semibold mt-2">${inline(heading[1])}</p>`);
    else if (line) out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  closeTable();
  return out.join('');
}

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

  @ViewChild('scroller') private scroller?: ElementRef<HTMLElement>;

  // --- Robot wandering: flies to a random spot, hovers a moment, repeats. It parks in the
  // bottom-right corner while the chat is open, pauses under the pointer, and stays parked
  // for users who prefer reduced motion.
  readonly pos = signal(this.dockPosition());
  readonly travelMs = signal(0);
  readonly tilt = signal(0);
  readonly flying = signal(false);
  private wanderTimer?: ReturnType<typeof setTimeout>;
  private paused = false;
  private readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  readonly open = signal(false);
  readonly profile = signal<AiCareProfile | null>(null);
  readonly messages = signal<(ChatMessage & { html?: string })[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  draft = '';

  constructor() {
    // A different account signing in on this tab must not see the previous conversation.
    effect(() => {
      this.auth.currentUser();
      this.messages.set([]);
      this.profile.set(null);
      this.error.set('');
    });
    this.scheduleWander(1500);
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
    this.tilt.set(Math.abs(target.x - x) < 20 ? 0 : target.x > x ? 10 : -10);
    this.flying.set(true);
    this.travelMs.set(ms);
    this.pos.set(target);
    return ms;
  }

  private scheduleWander(delay: number) {
    clearTimeout(this.wanderTimer);
    if (this.reducedMotion || this.paused || this.open()) return;
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
      this.scheduleWander(1500);
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
      next: ({ reply }) => {
        this.loading.set(false);
        this.messages.update((m) => [
          ...m,
          { role: 'assistant', content: reply, html: renderMarkdown(reply) },
        ]);
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
