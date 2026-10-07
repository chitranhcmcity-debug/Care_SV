import { ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { InboxScope, InboxService, InboxSummary } from '../../services/inbox.service';
import { BillingService } from '../../services/billing.service';
import { ROLE_LABELS } from '../../models/types';
import { BrandingService } from '../../services/branding.service';
import {
  ADMIN_CONFIG_TABS,
  ADMIN_SYSTEM_TABS,
  AdminTab,
  visibleDashboardTabs,
} from '../bang-dieu-khien-quan-tri/tab-bang-dieu-khien';
import { pageHero } from './hero-trang';

interface NavItem {
  path: string;
  label: string;
  /** Nhãn ngắn cho thanh tab dưới trên di động. */
  short?: string;
  /** Đường path icon nét 24px (kiểu Tabler). */
  icon: string;
  badge?: 'unread' | 'pendingTasks';
  /** Đặt trên các link tới một mục của bảng điều khiển (?tab=). */
  queryParams?: { tab: AdminTab };
}

/** Một nhóm link sidebar có tiêu đề; mọi link có cùng giao diện. */
interface NavSection {
  title: string;
  links: NavItem[];
}

const NAV_ITEMS: NavItem[] = [
  {
    path: '/admin',
    label: 'Quản trị hệ thống',
    icon: 'M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1zM15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1zM15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
  },
  {
    path: '/management',
    label: 'Quản lý & báo cáo',
    icon: 'M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1zM15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1zM15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
  },
  {
    path: '/students',
    label: 'Sinh viên',
    short: 'Sinh viên',
    icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85',
  },
  {
    path: '/attendance',
    label: 'Điểm danh lớp học',
    short: 'Điểm danh',
    icon: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M3 11h18M9 16l2 2 4-4',
  },
  {
    path: '/care',
    label: 'Hồ sơ chăm sóc',
    short: 'Chăm sóc',
    icon: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM9 11h6M12 8v6',
    badge: 'unread',
  },
  {
    path: '/tasks',
    label: 'Nhiệm vụ được giao',
    short: 'Nhiệm vụ',
    icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2zM9 12h6M9 16h4',
    badge: 'pendingTasks',
  },
  {
    path: '/timetable',
    label: 'Thời khóa biểu',
    short: 'Lịch học',
    icon: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M3 11h18M8 15h2M14 15h2',
  },
  {
    path: '/calls',
    label: 'Lịch sử cuộc gọi',
    short: 'Cuộc gọi',
    icon: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2M15 3h6v6M21 3l-6 6',
  },
  {
    path: '/account-approvals',
    label: 'Duyệt tài khoản',
    short: 'Duyệt TK',
    icon: 'M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3zM9 12l2 2 4-4',
  },
  {
    path: '/billing',
    label: 'Gói dịch vụ',
    short: 'Gói DV',
    icon: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 10h18M7 15h2M12 15h4',
  },
];

/** Các mục sidebar chứa các phần của bảng điều khiển. */
const DASHBOARD_PATHS = ['/admin', '/management'];

/** Các nhóm sidebar của người không phải admin (trang theo đường dẫn, mục bảng điều khiển theo id tab). */
const OVERVIEW_TABS: AdminTab[] = ['analytics'];
const WORK_PATHS = ['/care', '/tasks', '/students', '/attendance', '/calls', '/timetable'];
const TEAM_TABS: AdminTab[] = ['tasks', 'classes'];
const TEAM_PATHS = ['/account-approvals'];
const SETUP_TABS: AdminTab[] = ['courses', 'warnings', 'excel'];
const SETUP_PATHS = ['/billing'];

/** Chuyển chữ thường và bỏ dấu tiếng Việt để "diem danh" khớp "Điểm danh". */
const normalize = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

/** Khung ứng dụng đã đăng nhập (bố cục Berry): header toàn chiều rộng, sidebar, và trang theo route
 *  chiếu vào vùng nội dung bo tròn. */
@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './thanh-dieu-huong.component.html',
  host: { class: 'd-block min-vh-100 bg-white' },
})
export class NavbarComponent implements OnInit, OnDestroy {
  protected readonly branding = inject(BrandingService);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Công việc còn phải làm (liệt kê trong chuông thông báo). */
  unreadCount = 0;
  pendingTaskCount = 0;
  /** Công việc chưa xem theo từng loại (huy hiệu sidebar) và tổng (huy hiệu chuông). */
  careNew = 0;
  tasksNew = 0;
  unseenCount = 0;
  /** Những gì mới khi mở chuông, để danh sách vẫn đánh dấu được. */
  newCare = 0;
  newTasks = 0;
  sidebarOpen = false; // ngăn kéo di động
  sidebarCollapsed = false; // máy tính
  profileMenuOpen = false;
  notificationsOpen = false;
  searchTerm = '';
  get heroDate(): string {
    const text = new Date().toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  get todayLabel(): string {
    return new Date().toLocaleDateString('vi-VN');
  }
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private sessionIntervalId: ReturnType<typeof setInterval> | null = null;
  private navigation?: Subscription;

  constructor(
    public authService: AuthService,
    private inbox: InboxService,
    private router: Router,
    public billing: BillingService,
  ) {}

  ngOnInit(): void {
    this.billing.refreshStatus().subscribe({ error: () => {} });
    this.authService.refreshSession().subscribe();
    this.fetchNotifications();
    // Mở một trang công việc sẽ đánh dấu loại việc đó là đã xem. Zoneless: điều hướng xong
    // không phải sự kiện template, nên render lại để chuyển vùng sáng của sidebar sang trang mới.
    this.navigation = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.markPageSeen();
        this.cdr.markForCheck();
      });
    // Thăm dò số liệu chuông và sidebar mỗi 15 giây khi tab đang hiển thị, và cập nhật ngay
    // khi nó hiện lại.
    this.intervalId = setInterval(() => {
      if (!document.hidden) this.fetchNotifications();
    }, 15000);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    // Nhận thay đổi quyền do admin thực hiện trong lúc tab này vẫn mở.
    this.sessionIntervalId = setInterval(() => {
      if (!document.hidden) this.authService.refreshSession().subscribe();
    }, 60000);
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.sessionIntervalId) clearInterval(this.sessionIntervalId);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.navigation?.unsubscribe();
  }

  private readonly onVisibilityChange = () => {
    if (!document.hidden) this.fetchNotifications();
  };

  // Navbar chỉ được render trong khung đã đăng nhập (app.html), nên không cần kiểm tra đăng nhập ở đây.
  fetchNotifications() {
    if (!this.showNotifications) return;
    this.inbox.summary().subscribe({
      next: (res) => {
        this.apply(res);
        this.markPageSeen();
      },
      error: () => {},
    });
  }

  private apply(res: InboxSummary) {
    this.unreadCount = res.care.pending;
    this.pendingTaskCount = res.tasks.pending;
    this.careNew = res.care.new;
    this.tasksNew = res.tasks.new;
    this.unseenCount = res.unseen;
    if (!this.notificationsOpen) {
      this.newCare = res.care.new;
      this.newTasks = res.tasks.new;
    }
    // Zoneless: phản hồi HTTP không phải sự kiện template, nên render lại tường minh.
    this.cdr.markForCheck();
  }

  /** Ở trang nhiệm vụ gọi hoặc nhiệm vụ, việc mới loại đó được xem là đã thấy ngay khi xuất hiện. */
  private markPageSeen() {
    const path = this.router.url.split(/[?#]/)[0];
    const scope: InboxScope | null = path === '/care' ? 'care' : path === '/tasks' ? 'tasks' : null;
    const pending = scope === 'care' ? this.careNew : scope === 'tasks' ? this.tasksNew : 0;
    if (!scope || !pending) return;
    this.inbox.markSeen(scope).subscribe({ next: (res) => this.apply(res), error: () => {} });
  }

  /** Mở chuông đánh dấu mọi thứ là đã xem; danh sách vẫn hiện những gì mới. */
  toggleNotifications() {
    if (this.notificationsOpen) return this.closeNotifications();
    this.notificationsOpen = true;
    this.profileMenuOpen = false;
    if (!this.unseenCount) return;
    this.unseenCount = this.careNew = this.tasksNew = 0;
    this.inbox.markSeen().subscribe({ error: () => {} });
  }

  closeNotifications() {
    this.notificationsOpen = false;
    this.newCare = 0;
    this.newTasks = 0;
  }

  /** Đã hết hạn, hoặc còn tối đa 7 ngày: hiện banner gia hạn. */
  get subscriptionWarning() {
    const s = this.billing.status();
    return s && (!s.active || s.daysLeft <= 7) ? s : null;
  }

  get user() {
    return this.authService.currentUser();
  }

  get userInitial() {
    return (this.user?.fullName || '?').trim().charAt(0).toUpperCase();
  }

  get roleLabel() {
    const role = this.user?.role;
    return role ? ROLE_LABELS[role] : '';
  }

  /** Các nhóm sidebar, chỉ dựng lại khi vai trò hoặc quyền thay đổi: *ngFor phải nhận
   *  cùng các object ở mọi lần render, nếu không nó dựng lại link liên tục. */
  get navSections(): NavSection[] {
    const key = `${this.user?.role}|${this.authService.permissions()?.join(',')}`;
    if (key !== this.sectionsKey) {
      this.sectionsKey = key;
      this.sections = this.buildSections();
    }
    return this.sections;
  }
  private sectionsKey = '';
  private sections: NavSection[] = [];

  private buildSections(): NavSection[] {
    const auth = this.authService;
    const pages = NAV_ITEMS.filter(
      (item) => !DASHBOARD_PATHS.includes(item.path) && auth.canOpen(item.path),
    );
    const work = pages.filter((item) => item.path !== '/billing');
    const billing = pages.filter((item) => item.path === '/billing');
    const tabs = visibleDashboardTabs(auth);
    const tabLinks = (path: string, ids?: AdminTab[]): NavItem[] =>
      auth.canOpen(path)
        ? tabs
            .filter((tab) => !ids || ids.includes(tab.id))
            .map((tab) => ({
              path,
              label: tab.label,
              short: tab.short,
              icon: tab.icon,
              queryParams: { tab: tab.id },
            }))
        : [];
    if (auth.isAdmin()) {
      return [
        { title: 'Quản trị hệ thống', links: tabLinks('/admin', ADMIN_SYSTEM_TABS) },
        { title: 'Nghiệp vụ', links: work },
        { title: 'Cấu hình', links: [...tabLinks('/admin', ADMIN_CONFIG_TABS), ...billing] },
      ].filter((section) => section.links.length);
    }

    // Vai trò khác: tổng quan trước, rồi công việc hằng ngày, rồi điều hành đội, rồi thiết lập.
    const byPath = (paths: string[]) =>
      paths.flatMap((p) => pages.filter((item) => item.path === p));
    const home = auth.homePath();
    const daily = [
      ...byPath(WORK_PATHS),
      ...pages.filter(
        (item) => ![...WORK_PATHS, ...TEAM_PATHS, ...SETUP_PATHS].includes(item.path),
      ),
    ];
    // Trang đầu của vai trò đứng đầu nhóm của nó, nên cũng là tab di động đầu tiên.
    daily.sort((a, b) => Number(b.path === home) - Number(a.path === home));
    const listedTabs: AdminTab[] = [...OVERVIEW_TABS, ...TEAM_TABS, ...SETUP_TABS];
    const overview: NavSection = {
      title: 'Tổng quan',
      links: tabLinks('/management', OVERVIEW_TABS),
    };
    const workSection: NavSection = { title: 'Công việc', links: daily };
    // Nhóm nào chứa trang đầu thì đứng trước (nó cũng dẫn đầu thanh tab di động).
    return [
      ...(home === '/management' ? [overview, workSection] : [workSection, overview]),
      {
        title: 'Điều hành',
        links: [...tabLinks('/management', TEAM_TABS), ...byPath(TEAM_PATHS)],
      },
      {
        title: 'Cấu hình',
        links: [
          ...tabLinks('/management', SETUP_TABS),
          ...tabLinks('/management').filter((l) => !listedTabs.includes(l.queryParams!.tab)),
          ...byPath(SETUP_PATHS),
        ],
      },
    ].filter((section) => section.links.length);
  }

  /** Thanh tab dưới di động: link đầu của vai trò (trang chủ của nó), rồi các trang, rồi các mục
   *  bảng điều khiển; cái gì không vừa thì ở lại ngăn kéo Menu. */
  get bottomTabs(): NavItem[] {
    const sections = this.navSections;
    if (sections !== this.tabsFor) {
      this.tabsFor = sections;
      const links = sections.flatMap((section) => section.links);
      const [home, ...rest] = links;
      this.tabs = [
        ...(home ? [home] : []),
        ...rest.filter((item) => !item.queryParams),
        ...rest.filter((item) => item.queryParams),
      ].slice(0, 4);
    }
    return this.tabs;
  }
  private tabsFor: NavSection[] = [];
  private tabs: NavItem[] = [];

  /** Link mục khớp đường dẫn và ?tab= (không có tab = tab đầu của bảng điều khiển); trang khớp đường dẫn. */
  isActive(item: NavItem): boolean {
    const path = this.router.url.split(/[?#]/)[0];
    if (path !== item.path && !path.startsWith(item.path + '/')) return false;
    if (!item.queryParams) return true;
    const tab =
      this.router.parseUrl(this.router.url).queryParams['tab'] ??
      visibleDashboardTabs(this.authService)[0]?.id;
    return item.queryParams.tab === tab;
  }

  /** Hiện cho ai có thể nhận nhiệm vụ gọi hoặc nhiệm vụ được giao. */
  get showNotifications(): boolean {
    return this.authService.canOpen('/care') || this.authService.canOpen('/tasks');
  }

  badgeCount(item: NavItem): number {
    if (item.badge === 'unread') return this.careNew;
    if (item.badge === 'pendingTasks') return this.tasksNew;
    return 0;
  }

  /** Các trang có header chi tiết riêng không lặp lại banner trang chung. */
  get showPageHero(): boolean {
    const path = this.router.url.split(/[?#]/)[0];
    if (path === '/timetable') return false;
    if (path === '/care' && this.router.parseUrl(this.router.url).queryParams['case']) return false;
    if (path !== '/admin') return true;
    const tab =
      this.router.parseUrl(this.router.url).queryParams['tab'] ??
      visibleDashboardTabs(this.authService)[0]?.id;
    return tab !== 'overview';
  }

  /** Icon, văn bản và bảng màu của banner trang cho trang hiện tại. */
  get heroInfo() {
    const path = this.router.url.split(/[?#]/)[0];
    const tabId = DASHBOARD_PATHS.includes(path)
      ? (this.router.parseUrl(this.router.url).queryParams['tab'] ??
        visibleDashboardTabs(this.authService)[0]?.id)
      : null;
    const tab = tabId ? visibleDashboardTabs(this.authService).find((t) => t.id === tabId) : null;
    const icon =
      tab?.icon ?? NAV_ITEMS.find((item) => item.path === path)?.icon ?? NAV_ITEMS[0].icon;
    return { icon, ...pageHero(tab?.id ?? path) };
  }

  get pageTitle() {
    const tree = this.router.parseUrl(this.router.url);
    const path = this.router.url.split(/[?#]/)[0];
    const tab = DASHBOARD_PATHS.includes(path) ? tree.queryParams['tab'] : null;
    if (tab) {
      const label = visibleDashboardTabs(this.authService).find((t) => t.id === tab)?.label;
      if (label) return label;
    }
    return NAV_ITEMS.find((item) => item.path === path)?.label ?? 'Bảng điều khiển';
  }

  get searchResults(): NavItem[] {
    const term = normalize(this.searchTerm);
    return term
      ? this.navSections
          .flatMap((section) => section.links)
          .filter((item) => normalize(item.label).includes(term))
      : [];
  }

  goTo(item: NavItem | undefined) {
    if (!item) return;
    this.searchTerm = '';
    this.closeSidebar();
    this.router.navigate([item.path], { queryParams: item.queryParams });
  }

  toggleSidebar() {
    // Một nút: ngăn kéo trên di động, thu gọn trên máy tính.
    if (window.matchMedia('(min-width: 768px)').matches) {
      this.sidebarCollapsed = !this.sidebarCollapsed;
    } else {
      this.sidebarOpen = !this.sidebarOpen;
    }
  }

  closeSidebar() {
    this.sidebarOpen = false;
  }

  logout() {
    this.profileMenuOpen = false;
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
