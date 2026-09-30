import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/** Native size of each page; it is scaled down to fit the hero. */
const W = 1000;
const H = 560;
const FLIP_MS = 1700;
const PAGE_MS = 6000;

const I = {
  check: 'M5 12l5 5L20 7',
  calendar:
    'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M3 11h18M9 16l2 2 4-4',
  alert:
    'M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  userX: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M17 8l4 4M21 8l-4 4',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM9 11h6M12 8v6',
  phone:
    'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  sparkles:
    'M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z',
  chart: 'M4 19h16M7 16V10M12 16V5M17 16v-4',
};

/**
 * Landing-page hero: a desk calendar of product-introduction pages (no dashboard screens or
 * data). A page is lifted by its bottom-right corner and turned up over the binding.
 */
@Component({
  selector: 'app-demo-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './demo-calendar.component.html',
  styleUrl: './demo-calendar.component.css',
})
export class DemoCalendarComponent implements AfterViewInit, OnDestroy {
  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');

  readonly W = W;
  readonly H = H;
  readonly i = I;
  readonly scale = signal(0.6);
  readonly rings = Array.from({ length: 14 });

  readonly pages = [
    {
      id: 'attendance',
      label: 'Điểm danh',
      kicker: '01 · Điểm danh',
      title: ['Điểm danh đúng giờ,', 'chỉ vài chạm'],
      text: 'Giảng viên điểm danh ngay trong giờ học theo thời khóa biểu, hệ thống tự tính chuyên cần cho từng sinh viên.',
      points: ['Mở theo thời khóa biểu', 'Có mặt · Vắng · Có phép', 'Tự tính tỷ lệ chuyên cần'],
      theme: 'pg-violet',
    },
    {
      id: 'care',
      label: 'Cảnh báo & chăm sóc',
      kicker: '02 · Cảnh báo & chăm sóc',
      title: ['Phát hiện sớm,', 'chăm sóc kịp thời'],
      text: 'Sinh viên chạm mức cảnh báo được tự động mở hồ sơ và giao đúng người phụ trách để liên hệ.',
      points: ['Mức cảnh báo tự cấu hình', 'Tự giao nhân viên phụ trách', 'Gọi điện có ghi âm'],
      theme: 'pg-rose',
    },
    {
      id: 'ai',
      label: 'AI Care & báo cáo',
      kicker: '03 · AI Care & báo cáo',
      title: ['Trợ lý AI và', 'báo cáo trực quan'],
      text: 'Hỏi AI Care bằng tiếng Việt để tra cứu, nhận gợi ý chăm sóc và xem báo cáo tổng hợp tức thì.',
      points: ['Hỏi đáp bằng tiếng Việt', 'Gợi ý hướng chăm sóc', 'Báo cáo xuất Excel'],
      theme: 'pg-teal',
    },
  ];

  /** Care flow shown on page 2. */
  readonly flow = [
    { label: 'Sinh viên vắng học', icon: I.userX, tone: 'from-sky-400 to-indigo-500' },
    { label: 'Chạm mức cảnh báo', icon: I.alert, tone: 'from-amber-400 to-orange-500' },
    { label: 'Mở hồ sơ chăm sóc', icon: I.heart, tone: 'from-pink-400 to-rose-500' },
    { label: 'Gọi điện & theo dõi', icon: I.phone, tone: 'from-emerald-400 to-teal-500' },
  ];
  /** Abstract roster rows on page 1 (no names, just shapes). */
  readonly rows = [
    { av: 'from-amber-300 to-orange-400', w: 70, state: 'on' },
    { av: 'from-sky-300 to-indigo-400', w: 55, state: 'on' },
    { av: 'from-pink-300 to-rose-400', w: 62, state: 'off' },
    { av: 'from-emerald-300 to-teal-400', w: 48, state: 'on' },
    { av: 'from-violet-300 to-fuchsia-400', w: 66, state: 'half' },
  ];
  readonly bars = [45, 70, 55, 88, 64, 96, 78];

  // ---------- Page turning ----------
  readonly page = signal(0);
  /** Page revealed underneath while the current one is turned. */
  readonly next = signal(1);
  /** Index of the page being turned, or -1. */
  readonly turning = signal(-1);
  paused = false;
  private timer?: ReturnType<typeof setInterval>;
  private turnTimer?: ReturnType<typeof setTimeout>;
  private resize?: ResizeObserver;

  go(target: number) {
    if (target === this.page() || this.turning() >= 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.page.set(target);
      return;
    }
    this.next.set(target);
    this.turning.set(this.page());
    this.turnTimer = setTimeout(() => {
      this.page.set(target);
      this.turning.set(-1);
    }, FLIP_MS);
  }

  ngAfterViewInit() {
    this.resize = new ResizeObserver(([entry]) => this.scale.set(entry.contentRect.width / W));
    this.resize.observe(this.frame().nativeElement);
    this.timer = setInterval(() => {
      if (!this.paused && !document.hidden) this.go((this.page() + 1) % this.pages.length);
    }, PAGE_MS);
  }

  ngOnDestroy() {
    this.resize?.disconnect();
    clearInterval(this.timer);
    clearTimeout(this.turnTimer);
  }
}
