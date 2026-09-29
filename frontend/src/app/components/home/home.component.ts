import { AfterViewInit, Component, OnDestroy, signal, inject } from '@angular/core';
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
  styleUrl: './home.component.css',
})
export class HomeComponent implements AfterViewInit, OnDestroy {
  protected readonly branding = inject(BrandingService);

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
    },
    {
      title: 'AI Care',
      text: 'Trợ lý AI tra cứu, đề xuất hành động và soạn sẵn thao tác cho bạn.',
      icon: ICONS.cpu,
      tone: 'from-sky-500 to-indigo-500 shadow-indigo-500/30',
    },
    {
      title: 'Theo dõi',
      text: 'Cảnh báo vắng & cấm thi theo tiết, báo cáo trực quan, quản lý dễ dàng.',
      icon: ICONS.shieldCheck,
      tone: 'from-amber-400 to-orange-500 shadow-orange-500/30',
    },
    {
      title: 'Dành cho mọi vai trò',
      text: 'Từ Ban Giám Hiệu, Phòng CTSV, CSKH đến giảng viên.',
      icon: ICONS.users,
      tone: 'from-emerald-400 to-green-500 shadow-emerald-500/30',
    },
  ];

  /** The four roles as avatar initials next to the hero buttons. */
  readonly avatars = [
    { letter: 'B', tone: 'from-violet-500 to-fuchsia-500' },
    { letter: 'C', tone: 'from-sky-400 to-indigo-500' },
    { letter: 'K', tone: 'from-emerald-400 to-teal-500' },
    { letter: 'G', tone: 'from-amber-400 to-orange-500' },
  ];

  /** Hero mock-up content — illustrative only, not real data. */
  readonly mockMenu = [
    { label: 'Tổng quan', icon: ICONS.home },
    { label: 'Sinh viên', icon: ICONS.user },
    { label: 'Điểm danh', icon: ICONS.clock },
    { label: 'Cảnh báo', icon: ICONS.alert },
    { label: 'Công việc', icon: ICONS.clipboard },
    { label: 'Báo cáo', icon: ICONS.chart },
    { label: 'Tin nhắn', icon: ICONS.message },
  ];
  readonly mockStats = [
    {
      label: 'Đã liên hệ',
      value: 38,
      delta: '↑ 12%',
      icon: ICONS.phone,
      card: 'bg-emerald-50 border-emerald-100 text-emerald-700',
      bar: 'bg-emerald-400',
    },
    {
      label: 'Chưa gọi',
      value: 15,
      delta: '↓ 5%',
      icon: ICONS.clock,
      card: 'bg-amber-50 border-amber-100 text-amber-700',
      bar: 'bg-amber-400',
    },
    {
      label: 'Cấm thi',
      value: 7,
      delta: '↓ 30%',
      icon: ICONS.alert,
      card: 'bg-rose-50 border-rose-100 text-rose-700',
      bar: 'bg-rose-400',
    },
    {
      label: 'Cần theo dõi',
      value: 26,
      delta: '↑ 8%',
      icon: ICONS.users,
      card: 'bg-sky-50 border-sky-100 text-sky-700',
      bar: 'bg-sky-400',
    },
  ];
  readonly mockSpark = [35, 55, 45, 70, 60, 90];
  readonly mockDays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  readonly mockAlerts = [
    {
      title: 'Nguy cơ cấm thi',
      who: 'SV180123 · Nguyễn Văn An',
      when: '2 giờ',
      tone: 'bg-rose-100 text-rose-600',
    },
    {
      title: 'Vắng 3 buổi liên tiếp',
      who: 'SV180456 · Trần Thị Mai',
      when: '4 giờ',
      tone: 'bg-sky-100 text-sky-600',
    },
    {
      title: 'Chưa liên hệ phụ huynh',
      who: 'SV180789 · Lê Minh Quân',
      when: '6 giờ',
      tone: 'bg-amber-100 text-amber-600',
    },
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
      title: 'Phân lớp cho CSKH',
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
    },
    {
      title: 'Cảnh báo & chỉ đạo',
      text: 'Sinh viên chạm mức cảnh báo được mở hồ sơ chăm sóc, Trưởng phòng / PHT chỉ đạo người chăm sóc.',
    },
    {
      title: 'CSKH chăm sóc',
      text: 'Gọi điện, tìm nguyên nhân, đưa hướng giải quyết theo các bước — AI gợi ý, báo khó khăn.',
    },
    {
      title: 'Đánh giá & chốt hồ sơ',
      text: 'Nhân viên báo cáo kết quả, lãnh đạo duyệt, hồ sơ vào lịch sử.',
    },
  ];

  readonly roles = [
    {
      title: 'Quản trị viên',
      text: 'Tài khoản, phân quyền, cấu hình hệ thống, API và giao diện.',
      icon: ICONS.shield,
      tone: 'from-violet-500 to-fuchsia-500',
    },
    {
      title: 'Trưởng phòng / PHT',
      text: 'Phân lớp CSKH, giao việc, cấu hình mức cảnh báo, xem báo cáo.',
      icon: ICONS.chart,
      tone: 'from-pink-500 to-orange-400',
    },
    {
      title: 'Nhân viên CSKH',
      text: 'Gọi điện chăm sóc sinh viên các lớp được phân công, thực hiện việc được giao.',
      icon: ICONS.headset,
      tone: 'from-emerald-400 to-teal-500',
    },
    {
      title: 'Giảng viên',
      text: 'Điểm danh học phần mình dạy, xem thời khóa biểu và tình hình vắng của lớp.',
      icon: ICONS.book,
      tone: 'from-sky-500 to-indigo-500',
    },
  ];

  /** Decorative bar heights (%) for the hero mockup chart — not real data. */
  readonly mockBars = [82, 88, 95, 80, 90, 96, 78];

  /** Id of the section currently in view — drives the nav highlight. */
  readonly activeSection = signal('');
  readonly roleLabels = ROLE_LABELS;
  private sectionObserver?: IntersectionObserver;

  constructor(
    public authService: AuthService,
    private router: Router,
  ) {}

  ngAfterViewInit() {
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
  }

  ngOnDestroy() {
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
