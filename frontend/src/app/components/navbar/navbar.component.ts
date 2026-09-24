import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CallTaskService } from '../../services/call-task.service';
import { TaskService } from '../../services/task.service';
import { BillingService } from '../../services/billing.service';
import { ROLE_LABELS, Role } from '../../models/types';

interface NavItem {
  path: string;
  label: string;
  roles: Role[];
  /** 24px stroke icon path (Tabler-style). */
  icon: string;
  badge?: 'unread' | 'pendingTasks';
}

const NAV_ITEMS: NavItem[] = [
  {
    path: '/admin',
    label: 'Quản trị hệ thống',
    roles: ['admin'],
    icon: 'M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1zM15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1zM15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
  },
  {
    path: '/management',
    label: 'Quản lý & giao việc',
    roles: ['manager'],
    icon: 'M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1zM15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1zM15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
  },
  {
    path: '/students',
    label: 'Hồ sơ sinh viên',
    roles: ['admin', 'manager'],
    icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 11h6M19 8v6',
  },
  {
    path: '/attendance',
    label: 'Điểm danh lớp học',
    roles: ['admin', 'teacher'],
    icon: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M3 11h18M9 16l2 2 4-4',
  },
  {
    path: '/call-tasks',
    label: 'Nhiệm vụ gọi điện',
    roles: ['admin', 'manager', 'staff'],
    icon: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
    badge: 'unread',
  },
  {
    path: '/tasks',
    label: 'Nhiệm vụ được giao',
    roles: ['staff'],
    icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2zM9 12h6M9 16h4',
    badge: 'pendingTasks',
  },
  { path: '/reports', label: 'Báo cáo', roles: ['staff'], icon: 'M3 3v18h18M7 15l4-4 3 3 5-6' },
  {
    path: '/timetable',
    label: 'Thời khóa biểu',
    roles: ['admin', 'manager', 'staff', 'teacher'],
    icon: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M3 11h18M8 15h2M14 15h2',
  },
  {
    path: '/calls',
    label: 'Lịch sử cuộc gọi',
    roles: ['admin', 'manager', 'staff', 'teacher'],
    icon: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2M15 3h6v6M21 3l-6 6',
  },
  {
    path: '/billing',
    label: 'Gói dịch vụ',
    roles: ['admin'],
    icon: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 10h18M7 15h2M12 15h4',
  },
];

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
  unreadCount = 0;
  pendingTaskCount = 0;
  sidebarOpen = false; // mobile drawer
  sidebarCollapsed = false; // desktop
  profileMenuOpen = false;
  searchTerm = '';
  get todayLabel(): string {
    return new Date().toLocaleDateString('vi-VN');
  }
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    public authService: AuthService,
    private callTaskService: CallTaskService,
    private taskService: TaskService,
    private router: Router,
    public billing: BillingService,
  ) {}

  ngOnInit(): void {
    this.billing.refreshStatus().subscribe({ error: () => {} });
    this.fetchUnreadCount();
    this.fetchPendingTaskCount();
    // Poll unread notification count every 15 seconds
    this.intervalId = setInterval(() => {
      this.fetchUnreadCount();
      this.fetchPendingTaskCount();
    }, 15000);
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  // The navbar is only rendered inside the signed-in shell (app.html), so no login checks here.
  fetchUnreadCount() {
    this.callTaskService.getUnreadCount().subscribe({
      next: (res) => (this.unreadCount = res.unreadCount || 0),
      error: () => (this.unreadCount = 0),
    });
  }

  fetchPendingTaskCount() {
    if (this.authService.isStaff()) {
      this.taskService.getPendingCount().subscribe({
        next: (res) => (this.pendingTaskCount = res.pendingCount || 0),
        error: () => (this.pendingTaskCount = 0),
      });
    }
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

  get navItems(): NavItem[] {
    const role = this.user?.role as Role | undefined;
    return role ? NAV_ITEMS.filter((item) => item.roles.includes(role)) : [];
  }

  badgeCount(item: NavItem): number {
    if (item.badge === 'unread') return this.unreadCount;
    if (item.badge === 'pendingTasks') return this.pendingTaskCount;
    return 0;
  }

  get pageTitle() {
    const path = this.router.url.split(/[?#]/)[0];
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
    this.router.navigate([item.path]);
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
