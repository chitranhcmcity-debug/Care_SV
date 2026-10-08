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

/** Một thao tác đã chuẩn bị, hiện thành thẻ có Xác nhận / Hủy. */
type ActionCard = AiCareAction & {
  state: 'pending' | 'running' | 'done' | 'cancelled' | 'error';
  result?: string;
};
import { renderMarkdown } from '../../utils/markdown';

const MAX_HISTORY = 20; // khớp giới hạn của backend
// Kích thước nút robot theo px (giữ đồng bộ với .robot-launcher trong CSS).
const ROBOT_W = 96;
const ROBOT_H = 80;
// Robot đứng nguyên chỗ người dùng thả bao lâu trước khi lại đi lang thang.
const DROP_REST_MS = 8000;

/** AI Care: trợ lý nổi có ở mọi trang đã đăng nhập; việc nó làm được tùy theo vai trò. */
@Component({
  selector: 'app-ai-care',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-cham-soc.component.html',
  styleUrl: './ai-cham-soc.component.css',
})
export class AiCareComponent {
  private readonly ai = inject(AiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @ViewChild('scroller') private scroller?: ElementRef<HTMLElement>;

  // --- Robot lang thang: bay tới một chỗ ngẫu nhiên, lơ lửng một lúc, lặp lại. Nó đậu ở
  // góc dưới bên phải khi chat đang mở, dừng khi con trỏ ở dưới nó, và đứng yên
  // với người dùng thích giảm chuyển động.
  readonly pos = signal(this.homePosition());
  readonly travelMs = signal(0);
  readonly tilt = signal(0);
  readonly flying = signal(false);
  /** Robot quay mặt về hướng nào; ban đầu nó ở vị trí nhà, nhìn vào trang. */
  readonly facing = signal<'left' | 'right'>(
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 'right' : 'left',
  );
  private wanderTimer?: ReturnType<typeof setTimeout>;
  private paused = false;
  // Kéo để di chuyển: robot nghỉ ở chỗ được thả, rồi quay lại đi lang thang.
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
  readonly messages = signal<
    (ChatMessage & { html?: string; actions?: ActionCard[]; imageUrl?: string })[]
  >([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly imageUrl = signal<string | null>(null);
  readonly imageName = signal('');
  draft = '';

  constructor() {
    // Tài khoản khác đăng nhập trên tab này không được thấy cuộc trò chuyện trước.
    // Làm mới phiên đặt lại cùng một người dùng, nên chỉ xóa khi tài khoản thật sự đổi.
    const idOf = (u: { id?: string; _id?: string } | null) => u?.id ?? u?._id;
    let userId = idOf(this.auth.currentUser());
    effect(() => {
      const id = idOf(this.auth.currentUser());
      if (id === userId) return;
      userId = id;
      this.messages.set([]);
      this.profile.set(null);
      this.error.set('');
      this.removeImage();
    });
    this.scheduleWander(8000); // nghỉ ở vị trí nhà trước
    inject(DestroyRef).onDestroy(() => clearTimeout(this.wanderTimer));
  }

  @HostListener('window:resize')
  onResize() {
    // Giữ robot trong màn hình khi cửa sổ thu nhỏ.
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
    // Vài pixel rung vẫn tính là một cú bấm.
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
    if (!drag.moved) return; // bấm thường: (click) mở chat
    this.dragging.set(false);
    this.suppressClick = true; // cú click phát sinh sau khi kéo không được mở chat
    // Nghỉ ở chỗ được thả một lúc, rồi tiếp tục đi lang thang.
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
      minY: 72, // dưới header trên cùng
      maxX: Math.max(margin, window.innerWidth - ROBOT_W - margin),
      maxY: Math.max(72, window.innerHeight - ROBOT_H - margin - 10),
    };
  }

  /** Vị trí nghỉ mặc định: cuối sidebar trái trên desktop, thanh dock trên điện thoại. */
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
    // Các bước nhảy chủ yếu theo chiều dọc giữ nguyên hướng nhìn, để robot không lật qua lật lại.
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
        this.scheduleWander(2500 + Math.random() * 3500); // lơ lửng tại chỗ một lúc
      }, ms);
    }, delay);
  }

  toggle() {
    this.open.update((v) => !v);
    clearTimeout(this.wanderTimer);
    if (this.open()) {
      // Đậu cạnh khung chat.
      const ms = this.flyTo(this.dockPosition(), 900);
      this.wanderTimer = setTimeout(() => {
        this.flying.set(false);
        this.tilt.set(0);
      }, ms);
    } else {
      // Quay về vị trí nghỉ, ở lại một lúc, rồi bắt đầu đi lang thang lại.
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
    this.removeImage();
  }

  async onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.loadImage(file);
  }

  onPaste(event: ClipboardEvent) {
    const imageItem = [...(event.clipboardData?.items ?? [])].find(
      (item) => item.kind === 'file' && item.type.startsWith('image/'),
    );
    const file = imageItem?.getAsFile();
    if (!file) return;
    event.preventDefault();
    void this.loadImage(file);
  }

  private async loadImage(file: File) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      this.error.set('Chỉ nhận ảnh PNG, JPEG hoặc WebP.');
      return;
    }
    try {
      let blob: Blob = file;
      if (file.size > 4 * 1024 * 1024) {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (result) => (result ? resolve(result) : reject(new Error('Không xử lý được ảnh'))),
            'image/jpeg',
            0.82,
          ),
        );
      }
      if (blob.size > 4 * 1024 * 1024) throw new Error('Ảnh quá lớn, vui lòng chọn ảnh khác.');
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Không đọc được ảnh'));
        reader.readAsDataURL(blob);
      });
      this.imageUrl.set(dataUrl);
      this.imageName.set(file.name);
      this.error.set('');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Không đọc được ảnh.');
    }
  }

  removeImage() {
    this.imageUrl.set(null);
    this.imageName.set('');
  }

  send(text = this.draft) {
    const content = text.trim();
    const imageUrl = this.imageUrl();
    if ((!content && !imageUrl) || this.loading()) return;
    this.draft = '';
    this.removeImage();
    this.error.set('');
    this.messages.update((m) => [...m, { role: 'user', content, imageUrl: imageUrl || undefined }]);
    this.scrollToEnd();
    this.loading.set(true);
    const history = this.messages()
      .slice(-MAX_HISTORY)
      .map(({ role, content }) => ({ role, content }));
    // Backend yêu cầu lịch sử phải bắt đầu bằng lượt của người dùng.
    while (history.length && history[0].role !== 'user') history.shift();
    const request = history.map((message, index) =>
      index === history.length - 1 && imageUrl
        ? { ...message, image: { dataUrl: imageUrl } }
        : message,
    );
    this.ai.careChat(request).subscribe({
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
        // Bỏ câu hỏi chưa được trả lời để lịch sử luôn xen kẽ người dùng/trợ lý.
        this.messages.update((m) => m.slice(0, -1));
        this.draft = content;
        if (imageUrl) {
          this.imageUrl.set(imageUrl);
          this.imageName.set('Ảnh đã chọn');
        }
        this.error.set(err.error?.message || 'AI Care đang bận, vui lòng thử lại.');
      },
    });
  }

  /** Chạy một thao tác đã chuẩn bị (người dùng bấm Xác nhận) và hiện kết quả trên thẻ của nó. */
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
        // Đưa người dùng tới trang cho thấy thay đổi.
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

  /** Mở trang AI Care chỉ tới, nếu người dùng này được phép mở. */
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
