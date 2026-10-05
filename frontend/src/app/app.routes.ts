import { Routes } from '@angular/router';
import { pageGuard } from './guards/auth.guard';

const dashboard = () =>
  import('./components/bang-dieu-khien-quan-tri/bang-dieu-khien-quan-tri.component').then(
    (m) => m.AdminDashboardComponent,
  );

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./components/trang-chu/trang-chu.component').then((m) => m.HomeComponent),
  },
  // One component renders every auth screen; `data.mode` picks which.
  ...(
    [
      ['login', 'login'],
      ['register', 'register'],
      ['forgot-password', 'forgot'],
      ['reset-password', 'reset'],
      // Trưởng phòng / PHT own plan: renewal link from email or login, and PayOS return page.
      ['renew', 'renew'],
      ['account-payment', 'payment'],
    ] as const
  ).map(([path, mode]) => ({
    path,
    data: { mode },
    loadComponent: () => import('./components/dang-nhap/dang-nhap.component').then((m) => m.LoginComponent),
  })),
  // One dashboard; tabs are filtered by permission (see AdminDashboardComponent.visibleTabs).
  { path: 'admin', loadComponent: dashboard, canActivate: [pageGuard] },
  { path: 'management', loadComponent: dashboard, canActivate: [pageGuard] },
  { path: 'reports', redirectTo: 'management' },
  {
    path: 'students',
    loadComponent: () =>
      import('./components/sinh-vien/sinh-vien.component').then((m) => m.StudentsComponent),
    canActivate: [pageGuard],
  },
  {
    path: 'calls',
    loadComponent: () =>
      import('./components/lich-su-cuoc-goi/lich-su-cuoc-goi.component').then(
        (m) => m.CallHistoryComponent,
      ),
    canActivate: [pageGuard],
  },
  {
    path: 'timetable',
    loadComponent: () =>
      import('./components/thoi-khoa-bieu/thoi-khoa-bieu.component').then((m) => m.TimetableComponent),
    canActivate: [pageGuard],
  },
  {
    path: 'attendance',
    loadComponent: () =>
      import('./components/diem-danh/diem-danh.component').then((m) => m.AttendanceComponent),
    canActivate: [pageGuard],
  },
  {
    path: 'care',
    loadComponent: () => import('./components/cham-soc/cham-soc.component').then((m) => m.CareComponent),
    canActivate: [pageGuard],
  },
  { path: 'call-tasks', redirectTo: 'care' },
  {
    path: 'billing',
    loadComponent: () =>
      import('./components/thanh-toan/thanh-toan.component').then((m) => m.BillingComponent),
    canActivate: [pageGuard],
  },
  {
    path: 'account-approvals',
    loadComponent: () =>
      import('./components/duyet-tai-khoan/duyet-tai-khoan.component').then(
        (m) => m.AccountApprovalsComponent,
      ),
    canActivate: [pageGuard],
  },
  {
    path: 'tasks',
    loadComponent: () => import('./components/nhiem-vu/nhiem-vu.component').then((m) => m.TaskComponent),
    canActivate: [pageGuard],
  },
  { path: '**', redirectTo: '' },
];
