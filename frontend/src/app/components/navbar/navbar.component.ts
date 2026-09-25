import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { InboxService } from '../../services/inbox.service';
import { BillingService } from '../../services/billing.service';
import { ROLE_LABELS } from '../../models/types';
import { BrandingService } from '../../services/branding.service';
import {
  ADMIN_CONFIG_TABS,
  ADMIN_SYSTEM_TABS,
  AdminTab,
  DashboardTab,
  visibleDashboardTabs,
} from '../admin-dashboard/dashboard-tabs';

interface NavItem {
  path: string;
  label: string;
  /** 24px stroke icon path (Tabler-style). */
  icon: string;
  badge?: 'unread' | 'pendingTasks';
  /** Dashboard entries: the ?tab= sections listed under it (all visible tabs when omitted). */
  tabs?: AdminTab[];
  /** Tab the entry itself opens. */
  queryParams?: { tab: AdminTab };
}

const NAV_ITEMS: NavItem[] = [
  {
    path: '/admin',
    label: 'Quản trị hệ thống',
    tabs: ADMIN_SYSTEM_TABS,
    icon: 'M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1zM15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1zM15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
  },
  {
    path: '/admin',
    label: 'Cấu hình hệ thống',
    tabs: ADMIN_CONFIG_TABS,
    queryParams: { tab: 'integrations' },
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
  },
  {
    path: '/management',
    label: 'Quản lý & báo cáo',
    icon: 'M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1zM15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1zM15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
  },
  {
    path: '/students',
    label: 'Hồ sơ sinh viên',
    icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 11h6M19 8v6',
  },
  {
    path: '/attendance',
    label: 'Điểm danh lớp học',
    icon: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M3 11h18M9 16l2 2 4-4',
  },
  {
    path: '/call-tasks',
    label: 'Nhiệm vụ gọi điện',
    icon: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
    badge: 'unread',
  },
  {
    path: '/tasks',
    label: 'Nhiệm vụ được giao',
    icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2zM9 12h6M9 16h4',
    badge: 'pendingTasks',
  },
  {
    path: '/timetable',
    label: 'Thời khóa biểu',
    icon: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M3 11h18M8 15h2M14 15h2',
  },
  {
    path: '/calls',
    label: 'Lịch sử cuộc gọi',
    icon: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2M15 3h6v6M21 3l-6 6',
  },
  {
    path: '/billing',
    label: 'Gói dịch vụ',
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
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  host: { class: 'block min-h-screen bg-white' },
})
export class NavbarComponent implements OnInit, OnDestroy {
  protected readonly branding = inject(BrandingService);

  /** Sidebar badges: call tasks not yet called, assigned tasks needing action. */
  unreadCount = 0;
  pendingTaskCount = 0;
  /** Bell badge: work that appeared since the bell was last opened. */
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
  }

  // The navbar is only rendered inside the signed-in shell (app.html), so no login checks here.
  fetchNotifications() {
    if (!this.showNotifications) return;
    this.inbox.summary().subscribe({
      next: (res) => {
        this.unreadCount = res.callTasks.pending;
        this.pendingTaskCount = res.tasks.pending;
        this.unseenCount = res.unseen;
        if (!this.notificationsOpen) {
          this.newCallTasks = res.callTasks.new;
          this.newTasks = res.tasks.new;
        }
      },
      error: () => {},
    });
  }

  /** Opening the bell marks everything as seen; the list keeps showing what was new. */
  toggleNotifications() {
    if (this.notificationsOpen) return this.closeNotifications();
    this.notificationsOpen = true;
    this.profileMenuOpen = false;
    if (!this.unseenCount) return;
    this.unseenCount = 0;
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

  /** Plain pages, then the dashboard entries with their sections. The admin lands on
   *  "Quản trị hệ thống" (system overview first), so that group leads the list instead. */
  get navItems(): NavItem[] {
    const items = NAV_ITEMS.filter((item) => this.authService.canOpen(item.path));
    const plain = items.filter((item) => !DASHBOARD_PATHS.includes(item.path));
    const dashboards = items.filter((item) => DASHBOARD_PATHS.includes(item.path));
    return this.authService.isAdmin()
      ? [dashboards[0], ...plain, ...dashboards.slice(1)]
      : [...plain, ...dashboards];
  }

  /** Dashboard sections shown under a dashboard entry of the sidebar. */
  tabsFor(item: NavItem): DashboardTab[] {
    if (!DASHBOARD_PATHS.includes(item.path)) return [];
    const tabs = visibleDashboardTabs(this.authService);
    return item.tabs ? tabs.filter((tab) => item.tabs!.includes(tab.id)) : tabs;
  }

  /** A dashboard entry is active when the open tab is one of its sections (no ?tab= means the
   *  dashboard's first tab); other entries match their path. */
  isActive(item: NavItem): boolean {
    const tree = this.router.parseUrl(this.router.url);
    const path = this.router.url.split(/[?#]/)[0];
    if (path !== item.path && !path.startsWith(item.path + '/')) return false;
    if (!item.tabs) return true;
    const tab = tree.queryParams['tab'] ?? visibleDashboardTabs(this.authService)[0]?.id;
    return item.tabs.includes(tab);
  }

  /** Shown to anyone who can receive call tasks or assigned tasks. */
  get showNotifications(): boolean {
    return this.authService.canOpen('/call-tasks') || this.authService.canOpen('/tasks');
  }

  badgeCount(item: NavItem): number {
    if (item.badge === 'unread') return this.unreadCount;
    if (item.badge === 'pendingTasks') return this.pendingTaskCount;
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
    return term ? this.navItems.filter((item) => normalize(item.label).includes(term)) : [];
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
