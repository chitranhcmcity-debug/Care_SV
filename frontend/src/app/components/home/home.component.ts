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
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
})
export class HomeComponent implements AfterViewInit, OnDestroy {
  protected readonly branding = inject(BrandingService);

  readonly navLinks = [
    { id: 'tinh-nang', label: 'Tính năng' },
    { id: 'quy-trinh', label: 'Quy trình' },
    { id: 'danh-cho-ai', label: 'Dành cho ai' },
    { id: 'lien-he', label: 'Liên hệ' },
  ];

  readonly highlights = [
    {
      value: '3',
      label: 'Vai trò người dùng',
      icon: ICONS.users,
      tone: 'bg-violet-50 text-violet-600',
    },
    {
      value: '100%',
      label: 'Tự động phân công',
      icon: ICONS.bolt,
      tone: 'bg-blue-50 text-blue-500',
    },
    {
      value: '24/7',
      label: 'Theo dõi trạng thái',
      icon: ICONS.clock,
      tone: 'bg-emerald-50 text-emerald-600',
    },
    {
      value: 'Sớm',
      label: 'Cảnh báo cấm thi',
      icon: ICONS.alert,
      tone: 'bg-amber-50 text-amber-600',
    },
  ];

  readonly features = [
    {
      title: 'Điểm danh theo học phần',
      text: 'Giảng viên điểm danh nhanh theo từng buổi học, tự động đối chiếu lịch học trong tuần.',
      icon: ICONS.clipboard,
      tone: 'bg-violet-50 text-violet-600 group-hover:bg-violet-600 group-hover:text-white',
    },
    {
      title: 'Nhiệm vụ gọi điện tự động',
      text: 'Sinh viên vắng học được tự động phân công cho nhân viên CSKH liên hệ nhắc nhở.',
      icon: ICONS.phone,
      tone: 'bg-blue-50 text-blue-500 group-hover:bg-blue-500 group-hover:text-white',
    },
    {
      title: 'Cảnh báo nguy cơ cấm thi',
      text: 'Thống kê số buổi vắng theo học phần, cảnh báo sớm cho Phòng Đào Tạo can thiệp kịp thời.',
      icon: ICONS.alert,
      tone: 'bg-amber-50 text-amber-600 group-hover:bg-amber-500 group-hover:text-white',
    },
    {
      title: 'Phân quyền theo vai trò',
      text: 'Quản trị viên, Giảng viên và Nhân viên CSKH mỗi vai trò một khu vực làm việc riêng.',
      icon: ICONS.lock,
      tone: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white',
    },
  ];

  readonly steps = [
    {
      title: 'Giảng viên điểm danh',
      text: 'Ghi nhận sinh viên vắng học theo từng buổi trong học phần.',
    },
    {
      title: 'Hệ thống tự phân công',
      text: 'Sinh viên vắng được tự động tạo nhiệm vụ gọi điện, chia đều cho nhân viên CSKH.',
    },
    {
      title: 'Nhân viên CSKH liên hệ',
      text: 'Gọi điện nhắc nhở, ghi nhận lý do vắng và cập nhật trạng thái xử lý.',
    },
    {
      title: 'Cảnh báo cấm thi',
      text: 'Sinh viên vắng quá số buổi quy định được đưa vào danh sách cảnh báo cho Ban Giám Hiệu.',
    },
  ];

  readonly roles = [
    {
      title: 'Quản trị viên',
      text: 'Cấu hình học phần, nhập sinh viên hàng loạt qua Excel, phân quyền nhân sự CSKH và xem báo cáo thống kê cảnh báo cấm thi toàn trường.',
      icon: ICONS.shield,
      card: 'bg-violet-600 text-white',
      circle: 'bg-violet-800',
      iconBox: 'bg-violet-800 text-white',
      textTone: 'text-violet-100',
    },
    {
      title: 'Giảng viên',
      text: 'Điểm danh theo từng buổi học của học phần mình phụ trách, xem lại lịch sử và thời khóa biểu.',
      icon: ICONS.book,
      card: 'bg-blue-500 text-white',
      circle: 'bg-blue-700',
      iconBox: 'bg-blue-700 text-white',
      textTone: 'text-blue-50',
    },
    {
      title: 'Nhân viên CSKH',
      text: 'Nhận nhiệm vụ gọi điện cho sinh viên vắng học được phân công, ghi nhận lý do và cập nhật kết quả liên hệ.',
      icon: ICONS.headset,
      card: 'bg-white text-slate-900 ring-1 ring-slate-200',
      circle: 'bg-amber-100',
      iconBox: 'bg-amber-50 text-amber-600',
      textTone: 'text-slate-500',
    },
  ];

  /** Decorative bar heights (%) for the hero mockup chart — not real data. */
  readonly mockBars = [
    [30, 15],
    [55, 20],
    [25, 12],
    [40, 18],
    [35, 25],
    [70, 22],
  ];

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
