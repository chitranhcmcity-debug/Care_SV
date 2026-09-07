import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { AdminDashboardComponent } from './components/admin-dashboard/admin-dashboard.component';
import { AttendanceComponent } from './components/attendance/attendance.component';
import { CallTaskComponent } from './components/call-task/call-task.component';
import { adminGuard, staffOrAdminGuard, teacherOrAdminGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'admin', component: AdminDashboardComponent, canActivate: [adminGuard] },
  { path: 'attendance', component: AttendanceComponent, canActivate: [teacherOrAdminGuard] },
  { path: 'call-tasks', component: CallTaskComponent, canActivate: [staffOrAdminGuard] },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];
