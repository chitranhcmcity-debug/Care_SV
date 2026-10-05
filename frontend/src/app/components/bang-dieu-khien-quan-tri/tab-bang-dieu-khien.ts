import { AuthService } from '../../services/auth.service';
import { Permission } from '../../models/types';

// Các tab của bảng điều khiển quản trị / quản lý. Sidebar liệt kê chúng dưới mục bảng điều khiển và
// bảng điều khiển đọc tab đang chọn từ tham số truy vấn ?tab=.
export type AdminTab =
  | 'overview'
  | 'excel'
  | 'staff'
  | 'analytics'
  | 'courses'
  | 'settings'
  | 'tasks'
  // Link ?tab=progress cũ: tiến độ nhân viên giờ nằm trong tab nhiệm vụ.
  | 'progress'
  | 'permissions'
  | 'integrations'
  | 'classes'
  | 'warnings';

/** Admin vận hành hệ thống (tài khoản, phân quyền, cấu hình, API, giao diện) và chỉ xem báo cáo. */
export const ADMIN_TABS: AdminTab[] = [
  'overview',
  'staff',
  'permissions',
  'settings',
  'integrations',
  'analytics',
];

/** Sidebar của admin chia các tab thành hai nhóm: vận hành hệ thống và cấu hình hệ thống. */
export const ADMIN_SYSTEM_TABS: AdminTab[] = ['overview', 'staff', 'analytics', 'permissions'];
export const ADMIN_CONFIG_TABS: AdminTab[] = ['integrations', 'settings'];

/** Quyền mở khóa từng tab cho người không phải admin; tab không có quyền thì chỉ dành cho admin. */
export const TAB_PERMISSION: Partial<Record<AdminTab, Permission>> = {
  classes: 'classes.assign',
  warnings: 'warnings.configure',
  courses: 'courses.manage',
  excel: 'excel.import',
  tasks: 'tasks.manage',
  analytics: 'reports.view',
};

export interface DashboardTab {
  id: AdminTab;
  label: string;
  /** Nhãn ngắn cho thanh tab dưới trên điện thoại. */
  short?: string;
  /** Đường path icon nét 24px (kiểu Tabler). */
  icon: string;
}

export const DASHBOARD_TABS: DashboardTab[] = [
  {
    id: 'overview',
    label: 'Tổng quan hệ thống',
    short: 'Tổng quan',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11l2 2m-2-2v10a1 1 0 0 1-1 1h-3m-6 0a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1m-6 0h6',
  },
  {
    id: 'tasks',
    label: 'Giao việc & tiến độ',
    short: 'Giao việc',
    icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2zM9 14l2 2 4-4',
  },
  {
    id: 'courses',
    label: 'Cấu hình học phần',
    icon: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M3 11h18',
  },
  {
    id: 'classes',
    label: 'Phân lớp CSSV',
    icon: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h6',
  },
  {
    id: 'warnings',
    label: 'Mức cảnh báo',
    icon: 'M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  },
  {
    id: 'excel',
    label: 'Nhập sinh viên (Excel)',
    icon: 'M14 3v4a1 1 0 0 0 1 1h4M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2zM9 12l6 6M15 12l-6 6',
  },
  {
    id: 'staff',
    label: 'Tài khoản & nhân sự',
    icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85',
  },
  {
    id: 'analytics',
    label: 'Thống kê & cảnh báo',
    icon: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  },
  {
    id: 'permissions',
    label: 'Phân quyền',
    icon: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3zM9 12l2 2 4-4',
  },
  {
    id: 'integrations',
    label: 'Cấu hình API',
    icon: 'M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14',
  },
  {
    id: 'settings',
    label: 'Hệ thống & giao diện',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  },
];

/** Tab đầu của quản lý: tab thống kê dưới tên riêng của nó. Tạo một lần, vì
 *  sidebar gọi visibleDashboardTabs ở mỗi lần render và một object mới mỗi lần khiến *ngFor
 *  dựng lại link liên tục (trang bị đơ). */
const MANAGER_OVERVIEW_TAB: DashboardTab = {
  ...DASHBOARD_TABS.find((tab) => tab.id === 'analytics')!,
  label: 'Tổng quan & cảnh báo',
  short: 'Tổng quan',
};

/** Admin thấy các tab hệ thống; vai trò khác thấy các tab mà quyền của họ mở khóa. */
export function visibleDashboardTabs(auth: AuthService): DashboardTab[] {
  const tabs = DASHBOARD_TABS.filter((tab) => {
    if (auth.isAdmin()) return ADMIN_TABS.includes(tab.id);
    const permission = TAB_PERMISSION[tab.id];
    return permission !== undefined && auth.can(permission);
  });
  if (auth.isManager() && tabs.some((tab) => tab.id === 'analytics')) {
    return [MANAGER_OVERVIEW_TAB, ...tabs.filter((tab) => tab.id !== 'analytics')];
  }
  return tabs;
}
