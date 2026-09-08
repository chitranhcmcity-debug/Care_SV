import { Routes } from '@angular/router';
import { adminGuard, staffOrAdminGuard, teacherOrAdminGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./components/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./components/admin-dashboard/admin-dashboard.component').then(
        (m) => m.AdminDashboardComponent,
      ),
    canActivate: [adminGuard],
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
    canActivate: [staffOrAdminGuard],
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];
