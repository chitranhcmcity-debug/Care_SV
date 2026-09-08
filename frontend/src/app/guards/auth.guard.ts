import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { User } from '../models/types';

const forRoles =
  (...roles: User['role'][]): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);
    const role = auth.currentUser()!.role;
    if (roles.includes(role)) return true;
    const home = { admin: '/admin', staff: '/call-tasks', teacher: '/attendance' };
    return router.createUrlTree([home[role]]);
  };
export const adminGuard = forRoles('admin');
export const teacherOrAdminGuard = forRoles('admin', 'teacher');
export const staffOrAdminGuard = forRoles('admin', 'staff');
