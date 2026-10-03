import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ROLE_LABELS } from '../../models/types';
import { BrandingService } from '../../services/branding.service';

// 24px stroke icon paths (Tabler-style).
const ICONS = {
  users:
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85',
  bolt: 'M13 3 4 14h7l-1 7 9-11h-7l1-7z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 3',
  alert:
    'M12 8v5m0 3.5h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  clipboard:
    'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2zM9 14l2 2 4-4',
  phone:
    'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  lock: 'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V7a4 4 0 0 1 8 0v4',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z',
  book: 'M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h13M9 7h6',
  headset:
    'M4 14v-2a8 8 0 0 1 16 0v2M4 14a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2v-2zM20 14a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2v-2zM17 18a4 4 0 0 1-4 3h-1',
  chart: 'M4 19h16M7 16V10M12 16V5M17 16v-4',
  home: 'M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10',
  user: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  flow: 'M4 4h6v6H4zM14 14h6v6h-6zM7 10v4a3 3 0 0 0 3 3h4',
  cpu: 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4',
  shieldCheck: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3zM9 12l2 2 4-4',
  cap: 'M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 2.5 9 2.5 12 0v-5',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a2 2 0 0 0 3.4 0',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  calendarCheck:
    'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M3 10h18M9 15l2 2 4-4',
  shieldLock:
    'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3zM10 11V9.5a2 2 0 0 1 4 0V11M9.5 11h5v4h-5z',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  play: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM10 8.5v7l6-3.5-6-3.5z',
  sparkles:
    'M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z',
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css', './home-hero.css'],
})
export class HomeComponent implements AfterViewInit, OnDestroy {
  protected readonly branding = inject(BrandingService);
  @ViewChild('heroVideo') private heroVideo?: ElementRef<HTMLVideoElement>;

  readonly icons = ICONS;

  readonly navLinks = [
    { id: 'tinh-nang', label: 'Tính năng', icon: ICONS.bolt },
    { id: 'ai-care', label: 'AI Care', icon: ICONS.sparkles },
    { id: 'quy-trinh', label: 'Quy trình', icon: ICONS.flow },
    { id: 'danh-cho-ai', label: 'Dành cho ai', icon: ICONS.users },
    { id: 'lien-he', label: 'Liên hệ', icon: ICONS.phone },
  ];

  readonly highlights = [
    {
      title: 'Tự động',
      text: 'Tự động mở hồ sơ chăm sóc và giao nhân viên phụ trách lớp, theo dõi tiến độ.',
      icon: ICONS.bolt,
      tone: 'from-violet-500 to-fuchsia-500 shadow-fuchsia-500/30',
      theme: 'hl-violet',
      target: 'quy-trinh',
    },
    {
      title: 'AI Care',
      text: 'Trợ lý AI tra cứu, đề xuất hành động và soạn sẵn thao tác cho bạn.',
      icon: ICONS.cpu,
      tone: 'from-sky-500 to-indigo-500 shadow-indigo-500/30',
      theme: 'hl-sky',
      target: 'ai-care',
    },
    {
      title: 'Theo dõi',
      text: 'Cảnh báo vắng & cấm thi theo tiết, báo cáo trực quan, quản lý dễ dàng.',
      icon: ICONS.shieldCheck,
      tone: 'from-amber-400 to-orange-500 shadow-orange-500/30',
      theme: 'hl-amber',
      target: 'tinh-nang',
    },
    {
      title: 'Dành cho mọi vai trò',
      text: 'Từ Ban Giám Hiệu, Phòng CTSV, CSSV đến giảng viên.',
      icon: ICONS.users,
      tone: 'from-emerald-400 to-green-500 shadow-emerald-500/30',
      theme: 'hl-emerald',
      target: 'danh-cho-ai',
    },
  ];

  /** The four roles as avatar initials next to the hero buttons. */
  readonly avatars = [
    { letter: 'B', tone: 'from-violet-500 to-fuchsia-500' },
    { letter: 'C', tone: 'from-sky-400 to-indigo-500' },
    { letter: 'K', tone: 'from-emerald-400 to-teal-500' },
    { letter: 'G', tone: 'from-amber-400 to-orange-500' },
  ];

  // Feature cards: each `theme` sets the card tint, icon tile and arrow colours (see .f-* in the CSS).
  readonly features = [
    {
      title: 'Điểm danh đúng giờ học',
      text: 'Giảng viên điểm danh theo thời khóa biểu, chỉ mở trong giờ học và sửa được đến hết ngày. Trưởng phòng xử lý ngoại lệ.',
      icon: ICONS.calendarCheck,
      theme: 'f-violet',
    },
    {
      title: 'Gọi điện có ghi âm',
      text: 'Gọi sinh viên hoặc phụ huynh ngay trên trình duyệt qua tổng đài, lưu lịch sử và ghi âm.',
      icon: ICONS.phone,
      theme: 'f-sky',
    },
    {
      title: 'Cảnh báo theo tiết nghỉ',
      text: 'Các mức cảnh báo (nhắc nhở, báo phụ huynh, cấm thi) do Trưởng phòng tự cấu hình theo % hoặc số tiết.',
      icon: ICONS.alert,
      theme: 'f-amber',
    },
    {
      title: 'Phân lớp cho CSSV',
      text: 'Mỗi lớp hành chính có một nhân viên phụ trách; sinh viên vắng tự vào đúng hàng gọi của người đó, có lưu lịch sử bàn giao.',
      icon: ICONS.users,
      theme: 'f-emerald',
    },
    {
      title: 'Giao việc & KPI',
      text: 'Giao việc, nhận minh chứng, duyệt và theo dõi tiến độ, KPI của từng nhân viên.',
      icon: ICONS.chart,
      theme: 'f-pink',
    },
    {
      title: 'Phân quyền linh hoạt',
      text: 'Quản trị viên bật/tắt từng quyền cho mỗi vai trò, có hiệu lực ngay.',
      icon: ICONS.shieldLock,
      theme: 'f-indigo',
    },
  ];

  readonly steps = [
    {
      title: 'Giảng viên điểm danh',
      text: 'Ghi nhận sinh viên vắng ngay trong giờ học của học phần.',
      icon: ICONS.calendarCheck,
      theme: 'st-violet',
    },
    {
      title: 'Cảnh báo & chỉ đạo',
      text: 'Sinh viên chạm mức cảnh báo được mở hồ sơ chăm sóc, Trưởng phòng / PHT chỉ đạo người chăm sóc.',
      icon: ICONS.alert,
      theme: 'st-pink',
    },
    {
      title: 'CSSV chăm sóc',
      text: 'Gọi điện, tìm nguyên nhân, đưa hướng giải quyết theo các bước — AI gợi ý, báo khó khăn.',
      icon: ICONS.headset,
      theme: 'st-orange',
    },
    {
      title: 'Đánh giá & chốt hồ sơ',
      text: 'Nhân viên báo cáo kết quả, lãnh đạo duyệt, hồ sơ vào lịch sử.',
      icon: ICONS.shieldCheck,
      theme: 'st-green',
    },
  ];

  readonly roles = [
    {
      title: 'Quản trị viên',
      text: 'Tài khoản, phân quyền, cấu hình hệ thống, API và giao diện.',
      icon: ICONS.shield,
      tone: 'from-violet-500 to-fuchsia-500',
      theme: 'rl-violet',
      art: [ICONS.grid, ICONS.shieldLock, ICONS.cpu],
      points: [
        'Quản lý tài khoản & phân quyền',
        'Cấu hình hệ thống linh hoạt',
        'Quản lý API và tích hợp dịch vụ',
        'Tùy chỉnh logo, màu sắc giao diện',
      ],
    },
    {
      title: 'Trưởng phòng / PHT',
      text: 'Phân lớp CSSV, giao việc, cấu hình mức cảnh báo, xem báo cáo.',
      icon: ICONS.chart,
      tone: 'from-pink-500 to-orange-400',
      theme: 'rl-pink',
      art: [ICONS.clipboard, ICONS.chart, ICONS.users],
      points: [
        'Phân lớp và quản lý CSSV',
        'Giao việc và theo dõi tiến độ',
        'Cài đặt mức cảnh báo',
        'Xem báo cáo tổng quan, chi tiết',
      ],
    },
    {
      title: 'Nhân viên CSSV',
      text: 'Gọi điện chăm sóc sinh viên các lớp được phân công, thực hiện việc được giao.',
      icon: ICONS.headset,
      tone: 'from-emerald-400 to-teal-500',
      theme: 'rl-green',
      art: [ICONS.message, ICONS.headset, ICONS.phone],
      points: [
        'Danh sách lớp phụ trách',
        'Gọi điện và ghi nhận kết quả',
        'Cập nhật trạng thái chăm sóc',
        'Thực hiện việc được giao',
      ],
    },
    {
      title: 'Giảng viên',
      text: 'Điểm danh học phần mình dạy, xem thời khóa biểu và tình hình vắng của lớp.',
      icon: ICONS.book,
      tone: 'from-sky-500 to-indigo-500',
      theme: 'rl-blue',
      art: [ICONS.calendarCheck, ICONS.cap, ICONS.chart],
      points: [
        'Xem thời khóa biểu cá nhân',
        'Điểm danh lớp học phần',
        'Theo dõi tình hình vắng',
        'Xem tỷ lệ chuyên cần của lớp',
      ],
    },
  ];

  /** AI Care strengths listed next to the chat preview. */
  readonly aiPoints = [
    { text: 'Trả lời nhanh bằng tiếng Việt, đúng dữ liệu', icon: ICONS.message, tone: 'from-violet-500 to-fuchsia-500' },
    { text: 'Soạn sẵn thao tác: giao việc, ghi kết quả, phân lớp', icon: ICONS.clipboard, tone: 'from-pink-500 to-rose-500' },
    { text: 'Kiểm tra thông tin và đề xuất hành động', icon: ICONS.shieldCheck, tone: 'from-amber-400 to-orange-500' },
    { text: 'Tiết kiệm thời gian, tăng hiệu quả công việc', icon: ICONS.bolt, tone: 'from-emerald-400 to-green-500' },
  ];

  /** Id of the section currently in view — drives the nav highlight. */
  readonly activeSection = signal('');
  readonly roleLabels = ROLE_LABELS;
  private sectionObserver?: IntersectionObserver;
  private revealObserver?: IntersectionObserver;

  constructor(
    public authService: AuthService,
    private router: Router,
  ) {}

  ngAfterViewInit() {
    // Banner video: muted is set on the element itself (browsers only autoplay muted video);
    // visitors who prefer reduced motion see the still poster instead.
    const video = this.heroVideo?.nativeElement;
    if (video) {
      video.muted = true;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) video.play().catch(() => {});
    }
    // A section counts as active while it crosses a band just below the sticky header.
    this.sectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) this.activeSection.set(visible.target.id);
      },
      { rootMargin: '-80px 0px -60% 0px' },
    );
    for (const { id } of [{ id: 'trang-chu' }, ...this.navLinks]) {
      const el = document.getElementById(id);
      if (el) this.sectionObserver.observe(el);
    }
    this.setupReveal();
  }

  /**
   * Scroll reveal. Plain `.rv` blocks drop in as they enter the screen. Cards inside an `.rv-group`
   * grid are different: while the grid is on screen, each wheel notch drops ONE card and the page
   * stays put; only after every card has landed does scrolling carry on to the next block.
   * Touch screens, other ways of scrolling (nav links, keyboard, scrollbar) fill the grid by themselves.
   */
  private groups: { el: HTMLElement; items: HTMLElement[]; next: number }[] = [];
  private lastWheel = 0;
  private lastDrop = 0;

  private drop(el: HTMLElement, delay = 0) {
    el.style.setProperty('--rv-delay', `${delay}ms`);
    el.classList.add('rv-in');
  }

  private dropRest(g: { items: HTMLElement[]; next: number }, step: number) {
    for (let i = 0; g.next < g.items.length; i++) this.drop(g.items[g.next++], i * step);
  }

  private readonly onWheel = (e: WheelEvent) => {
    this.lastWheel = Date.now();
    if (e.deltaY <= 0 || e.ctrlKey) return;
    const vh = window.innerHeight;
    const g = this.groups.find((x) => {
      if (x.next >= x.items.length) return false;
      const r = x.el.getBoundingClientRect();
      return r.top < vh * 0.6 && r.bottom > 80 && x.items[x.next].getBoundingClientRect().top < vh - 40;
    });
    if (!g) return;
    e.preventDefault();
    if (this.lastWheel - this.lastDrop < 380) return; // one card per notch, trackpad bursts count once
    this.lastDrop = this.lastWheel;
    this.drop(g.items[g.next++]);
  };

  private readonly onScroll = () => {
    const wheeling = Date.now() - this.lastWheel < 250;
    const vh = window.innerHeight;
    for (const g of this.groups) {
      if (g.next >= g.items.length) continue;
      const r = g.el.getBoundingClientRect();
      if (r.bottom < 0) this.dropRest(g, 0);
      else if (!wheeling && r.top < vh * 0.8) this.dropRest(g, 140);
    }
  };

  private setupReveal() {
    const calm = matchMedia('(hover: none), (prefers-reduced-motion: reduce)').matches;
    const groupEls = Array.from(document.querySelectorAll<HTMLElement>('.rv-group'));
    const inGroup = new Set(groupEls.flatMap((g) => Array.from(g.querySelectorAll<HTMLElement>('.rv'))));
    const items = Array.from(document.querySelectorAll<HTMLElement>('.rv')).filter(
      (el) => calm || !inGroup.has(el),
    );
    this.revealObserver = new IntersectionObserver(
      (entries) => {
        entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top ||
              a.boundingClientRect.left - b.boundingClientRect.left,
          )
          .forEach((e, i) => {
            this.drop(e.target as HTMLElement, i * 140);
            this.revealObserver?.unobserve(e.target);
          });
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    items.forEach((el) => this.revealObserver!.observe(el));
    if (calm) return;

    this.groups = groupEls.map((el) => ({
      el,
      items: Array.from(el.querySelectorAll<HTMLElement>(':scope > .rv')),
      next: 0,
    }));
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('scroll', this.onScroll, { passive: true });
    this.onScroll();
  }

  ngOnDestroy() {
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('scroll', this.onScroll);
    this.revealObserver?.disconnect();
    this.sectionObserver?.disconnect();
  }

  scrollTop(event: Event) {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.activeSection.set('trang-chu');
  }

  scrollTo(id: string, event: Event) {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    this.activeSection.set(id);
  }

  logout() {
    this.authService.logout();
  }

  enterSystem() {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.router.navigate([this.authService.homePath()]);
  }
}
