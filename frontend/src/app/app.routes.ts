import { Routes } from '@angular/router';
import {
  adminGuard,
  callTaskGuard,
  managementGuard,
  managerGuard,
  signedInGuard,
  staffGuard,
  staffOrAdminGuard,
  teacherOrAdminGuard,
} from './guards/auth.guard';

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
  // One dashboard, tabs filtered per role (see AdminDashboardComponent.adminTabs).
  { path: 'admin', loadComponent: dashboard, canActivate: [adminGuard] },
  {
    path: 'management',
    loadComponent: dashboard,
    canActivate: [managerGuard],
    data: { tabs: ['tasks', 'analytics'] },
  },
  {
    path: 'reports',
    loadComponent: dashboard,
    canActivate: [staffGuard],
    data: { tabs: ['analytics'] },
  },
  {
    path: 'students',
    loadComponent: () =>
      import('./components/students/students.component').then((m) => m.StudentsComponent),
    canActivate: [managementGuard],
  },
  {
    path: 'calls',
    loadComponent: () =>
      import('./components/call-history/call-history.component').then(
        (m) => m.CallHistoryComponent,
      ),
    canActivate: [signedInGuard],
  },
  {
    path: 'timetable',
    loadComponent: () =>
      import('./components/timetable/timetable.component').then((m) => m.TimetableComponent),
    canActivate: [signedInGuard],
  },
  {
    path: 'attendance',
    loadComponent: () =>
      import('./components/attendance/attendance.component').then((m) => m.AttendanceComponent),
    canActivate: [teacherOrAdminGuard],
  },
  {
    path: 'call-tasks',
    loadComponent: () =>
      import('./components/call-task/call-task.component').then((m) => m.CallTaskComponent),
    canActivate: [callTaskGuard],
  },
  {
    path: 'billing',
    loadComponent: () =>
      import('./components/billing/billing.component').then((m) => m.BillingComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'tasks',
    loadComponent: () => import('./components/task/task.component').then((m) => m.TaskComponent),
    canActivate: [staffOrAdminGuard],
  },
  { path: '**', redirectTo: '' },
];
