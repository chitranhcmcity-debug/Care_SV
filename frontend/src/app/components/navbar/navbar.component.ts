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
} from '../admin-dashboard/dashboard-tabs';

interface NavItem {
  path: string;
  label: string;
  /** Short label for the mobile bottom tab bar. */
  short?: string;
  /** 24px stroke icon path (Tabler-style). */
  icon: string;
  badge?: 'unread' | 'pendingTasks';
  /** Set on links to a dashboard section (?tab=). */
  queryParams?: { tab: AdminTab };
}

/** A titled group of sidebar links; every link has the same look. */
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
    label: 'Hồ sơ sinh viên',
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
    path: '/call-tasks',
    label: 'Nhiệm vụ gọi điện',
    short: 'Gọi điện',
    icon: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
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
    path: '/billing',
    label: 'Gói dịch vụ',
    short: 'Gói DV',
    icon: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 10h18M7 15h2M12 15h4',
  },
];

/** Sidebar entries that host the dashboard sections. */
const DASHBOARD_PATHS = ['/admin', '/management'];

/** Lowercase and strip Vietnamese diacritics so "diem danh" matches "Điểm danh". */
const normalize = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

/** Signed-in app shell (Berry layout): full-width header, sidebar, and the routed page
 *  projected into the rounded content area. */
@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './navbar.component.html',
  host: { class: 'block min-h-screen bg-white' },
})
export class NavbarComponent implements OnInit, OnDestroy {
  protected readonly branding = inject(BrandingService);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Work still to do (listed in the bell). */
  unreadCount = 0;
  pendingTaskCount = 0;
  /** Unseen work per kind (sidebar badges) and in total (bell badge). */
  callTasksNew = 0;
  tasksNew = 0;
  unseenCount = 0;
  /** What was new when the bell was opened, so the list can still mark it. */
  newCallTasks = 0;
  newTasks = 0;
  sidebarOpen = false; // mobile drawer
  sidebarCollapsed = false; // desktop
  profileMenuOpen = false;
  notificationsOpen = false;
  searchTerm = '';
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
    // Opening a work page marks that kind of work as seen.
    this.navigation = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.markPageSeen());
    // Poll the bell and sidebar counts every 15 seconds
    this.intervalId = setInterval(() => this.fetchNotifications(), 15000);
    // Pick up permission changes made by the admin while this tab stays open.
    this.sessionIntervalId = setInterval(
      () => this.authService.refreshSession().subscribe(),
      60000,
    );
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.sessionIntervalId) clearInterval(this.sessionIntervalId);
    this.navigation?.unsubscribe();
  }

  // The navbar is only rendered inside the signed-in shell (app.html), so no login checks here.
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
    this.unreadCount = res.callTasks.pending;
    this.pendingTaskCount = res.tasks.pending;
    this.callTasksNew = res.callTasks.new;
    this.tasksNew = res.tasks.new;
    this.unseenCount = res.unseen;
    if (!this.notificationsOpen) {
      this.newCallTasks = res.callTasks.new;
      this.newTasks = res.tasks.new;
    }
    // Zoneless: an HTTP response is not a template event, so re-render explicitly.
    this.cdr.markForCheck();
  }

  /** On the call-task or task page, new work of that kind is seen as soon as it shows up. */
  private markPageSeen() {
    const path = this.router.url.split(/[?#]/)[0];
    const scope: InboxScope | null =
      path === '/call-tasks' ? 'callTasks' : path === '/tasks' ? 'tasks' : null;
    const pending =
      scope === 'callTasks' ? this.callTasksNew : scope === 'tasks' ? this.tasksNew : 0;
    if (!scope || !pending) return;
    this.inbox.markSeen(scope).subscribe({ next: (res) => this.apply(res), error: () => {} });
  }

  /** Opening the bell marks everything as seen; the list keeps showing what was new. */
  toggleNotifications() {
    if (this.notificationsOpen) return this.closeNotifications();
    this.notificationsOpen = true;
    this.profileMenuOpen = false;
    if (!this.unseenCount) return;
    this.unseenCount = this.callTasksNew = this.tasksNew = 0;
    this.inbox.markSeen().subscribe({ error: () => {} });
  }

  closeNotifications() {
    this.notificationsOpen = false;
    this.newCallTasks = 0;
    this.newTasks = 0;
  }

  /** Expired, or at most 7 days left: show the renewal banner. */
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

  /** Sidebar groups, rebuilt only when the role or permissions change: *ngFor must get the
   *  same objects on every render, or it rebuilds the links endlessly. */
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
    const sections: NavSection[] = auth.isAdmin()
      ? [
          { title: 'Quản trị hệ thống', links: tabLinks('/admin', ADMIN_SYSTEM_TABS) },
          { title: 'Nghiệp vụ', links: work },
          { title: 'Cấu hình', links: [...tabLinks('/admin', ADMIN_CONFIG_TABS), ...billing] },
        ]
      : [
          { title: 'Công việc', links: [...work, ...billing] },
          { title: 'Quản lý & báo cáo', links: tabLinks('/management') },
        ];
    return sections.filter((section) => section.links.length);
  }

  /** Mobile bottom tab bar: the role's first link (its home), then pages, then dashboard
   *  sections; whatever does not fit stays in the Menu drawer. */
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

  /** Section links match path and ?tab= (no tab = the dashboard's first); pages match path. */
  isActive(item: NavItem): boolean {
    const path = this.router.url.split(/[?#]/)[0];
    if (path !== item.path && !path.startsWith(item.path + '/')) return false;
    if (!item.queryParams) return true;
    const tab =
      this.router.parseUrl(this.router.url).queryParams['tab'] ??
      visibleDashboardTabs(this.authService)[0]?.id;
    return item.queryParams.tab === tab;
  }

  /** Shown to anyone who can receive call tasks or assigned tasks. */
  get showNotifications(): boolean {
    return this.authService.canOpen('/call-tasks') || this.authService.canOpen('/tasks');
  }

  badgeCount(item: NavItem): number {
    if (item.badge === 'unread') return this.callTasksNew;
    if (item.badge === 'pendingTasks') return this.tasksNew;
    return 0;
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
    // One button: drawer on mobile, collapse on desktop.
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
