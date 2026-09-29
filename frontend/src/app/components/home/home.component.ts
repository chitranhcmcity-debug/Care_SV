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

  readonly navLinks = [
    { id: 'tinh-nang', label: 'Tính năng' },
    { id: 'ai-care', label: 'AI Care' },
    { id: 'quy-trinh', label: 'Quy trình' },
    { id: 'danh-cho-ai', label: 'Dành cho ai' },
    { id: 'lien-he', label: 'Liên hệ' },
  ];

  readonly highlights = [
    { value: '4', label: 'Vai trò, mỗi vai trò một khu làm việc', icon: ICONS.users },
    { value: 'Tự động', label: 'Giao cuộc gọi theo lớp phụ trách', icon: ICONS.bolt },
    { value: 'Theo tiết', label: 'Cảnh báo vắng & cấm thi', icon: ICONS.alert },
    { value: 'AI Care', label: 'Trợ lý tra cứu & làm việc thay', icon: ICONS.sparkles },
  ];

  // Bento grid: `wide` cards span two columns on large screens.
  readonly features = [
    {
      title: 'Điểm danh đúng giờ học',
      text: 'Giảng viên điểm danh theo thời khóa biểu, chỉ mở trong giờ học và sửa được đến hết ngày. Trưởng phòng xử lý ngoại lệ.',
      icon: ICONS.clipboard,
      tone: 'from-violet-500 to-fuchsia-500',
      wide: true,
    },
    {
      title: 'Gọi điện có ghi âm',
      text: 'Gọi sinh viên hoặc phụ huynh ngay trên trình duyệt qua tổng đài, lưu lịch sử và ghi âm.',
      icon: ICONS.phone,
      tone: 'from-sky-500 to-indigo-500',
      wide: false,
    },
    {
      title: 'Cảnh báo theo tiết nghỉ',
      text: 'Các mức cảnh báo (nhắc nhở, báo phụ huynh, cấm thi) do Trưởng phòng tự cấu hình theo % hoặc số tiết.',
      icon: ICONS.alert,
      tone: 'from-amber-400 to-orange-500',
      wide: false,
    },
    {
      title: 'Phân lớp cho CSKH',
      text: 'Mỗi lớp hành chính có một nhân viên phụ trách; sinh viên vắng tự vào đúng hàng gọi của người đó, có lưu lịch sử bàn giao.',
      icon: ICONS.headset,
      tone: 'from-emerald-400 to-teal-500',
      wide: true,
    },
    {
      title: 'Giao việc & KPI',
      text: 'Giao việc, nhận minh chứng, duyệt và theo dõi tiến độ, KPI của từng nhân viên.',
      icon: ICONS.chart,
      tone: 'from-pink-500 to-rose-500',
      wide: false,
    },
    {
      title: 'Phân quyền linh hoạt',
      text: 'Quản trị viên bật/tắt từng quyền cho mỗi vai trò, có hiệu lực ngay.',
      icon: ICONS.lock,
      tone: 'from-slate-600 to-slate-800',
      wide: false,
    },
  ];

  readonly steps = [
    {
      title: 'Giảng viên điểm danh',
      text: 'Ghi nhận sinh viên vắng ngay trong giờ học của học phần.',
    },
    {
      title: 'Tự động giao cuộc gọi',
      text: 'Mỗi sinh viên vắng thành một cuộc gọi cho nhân viên phụ trách lớp của em đó.',
    },
    {
      title: 'CSKH liên hệ',
      text: 'Gọi điện, ghi lý do vắng, hẹn gọi lại, AI gợi ý cách trao đổi.',
    },
    {
      title: 'Cảnh báo kịp thời',
      text: 'Sinh viên chạm mức cảnh báo hiện ngay trên báo cáo cho Trưởng phòng.',
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
  readonly mockBars = [42, 68, 35, 80, 56, 92, 64];

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
    for (const { id } of this.navLinks) {
      const el = document.getElementById(id);
      if (el) this.sectionObserver.observe(el);
    }
  }

  ngOnDestroy() {
    this.sectionObserver?.disconnect();
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
