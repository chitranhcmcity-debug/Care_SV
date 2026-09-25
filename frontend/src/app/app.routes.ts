import { Routes } from '@angular/router';
import { pageGuard } from './guards/auth.guard';

const dashboard = () =>
  import('./components/admin-dashboard/admin-dashboard.component').then(
    (m) => m.AdminDashboardComponent,
  );

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./components/home/home.component').then((m) => m.HomeComponent),
  },
  // One component renders every auth screen; `data.mode` picks which.
  ...(
    [
      ['login', 'login'],
      ['register', 'register'],
      ['forgot-password', 'forgot'],
      ['reset-password', 'reset'],
      ['verify-email', 'verify'],
    ] as const
  ).map(([path, mode]) => ({
    path,
    data: { mode },
    loadComponent: () => import('./components/login/login.component').then((m) => m.LoginComponent),
  })),
  // One dashboard; tabs are filtered by permission (see AdminDashboardComponent.visibleTabs).
  { path: 'admin', loadComponent: dashboard, canActivate: [pageGuard] },
  { path: 'management', loadComponent: dashboard, canActivate: [pageGuard] },
  { path: 'reports', redirectTo: 'management' },
  {
    path: 'students',
    loadComponent: () =>
      import('./components/students/students.component').then((m) => m.StudentsComponent),
    canActivate: [pageGuard],
  },
  {
    path: 'calls',
    loadComponent: () =>
      import('./components/call-history/call-history.component').then(
        (m) => m.CallHistoryComponent,
      ),
    canActivate: [pageGuard],
  },
  {
    path: 'timetable',
    loadComponent: () =>
      import('./components/timetable/timetable.component').then((m) => m.TimetableComponent),
    canActivate: [pageGuard],
  },
  {
    path: 'attendance',
    loadComponent: () =>
      import('./components/attendance/attendance.component').then((m) => m.AttendanceComponent),
    canActivate: [pageGuard],
  },
  {
    path: 'call-tasks',
    loadComponent: () =>
      import('./components/call-task/call-task.component').then((m) => m.CallTaskComponent),
    canActivate: [pageGuard],
  },
  {
    path: 'billing',
    loadComponent: () =>
      import('./components/billing/billing.component').then((m) => m.BillingComponent),
    canActivate: [pageGuard],
  },
  {
    path: 'tasks',
    loadComponent: () => import('./components/task/task.component').then((m) => m.TaskComponent),
    canActivate: [pageGuard],
  },
  { path: '**', redirectTo: '' },
];
