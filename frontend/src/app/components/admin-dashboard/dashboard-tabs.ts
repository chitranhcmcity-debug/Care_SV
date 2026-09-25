import { AuthService } from '../../services/auth.service';
import { Permission } from '../../models/types';

// Tabs of the admin / management dashboard. The sidebar lists them under the dashboard entry and
// the dashboard reads the active one from the ?tab= query parameter.
export type AdminTab =
  | 'excel'
  | 'staff'
  | 'analytics'
  | 'courses'
  | 'settings'
  | 'tasks'
  | 'permissions'
  | 'integrations'
  | 'classes'
  | 'warnings';

/** The admin runs the system (accounts, permissions, config, API, look) and only views reports. */
export const ADMIN_TABS: AdminTab[] = [
  'staff',
  'permissions',
  'settings',
  'integrations',
  'analytics',
];

/** Permission that unlocks each tab for non-admins; tabs without one are admin-only. */
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
  /** 24px stroke icon path (Tabler-style). */
  icon: string;
}

export const DASHBOARD_TABS: DashboardTab[] = [
  {
    id: 'courses',
    label: 'Cấu hình học phần',
    icon: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M3 11h18',
  },
  {
    id: 'classes',
    label: 'Phân lớp CSKH',
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
    id: 'tasks',
    label: 'Giao việc',
    icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2zM9 14l2 2 4-4',
  },
  {
    id: 'analytics',
    label: 'Thống kê & cấm thi',
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

/** The admin sees the system tabs; other roles see the tabs their permissions unlock. */
export function visibleDashboardTabs(auth: AuthService): DashboardTab[] {
  const tabs = DASHBOARD_TABS.filter((tab) => {
    if (auth.isAdmin()) return ADMIN_TABS.includes(tab.id);
    const permission = TAB_PERMISSION[tab.id];
    return permission !== undefined && auth.can(permission);
  });
  if (auth.isManager()) {
    return [
      ...tabs
        .filter((tab) => tab.id === 'analytics')
        .map((tab) => ({ ...tab, label: 'Tổng quan & cảnh báo' })),
      ...tabs.filter((tab) => tab.id !== 'analytics'),
    ];
  }
  return tabs;
}
