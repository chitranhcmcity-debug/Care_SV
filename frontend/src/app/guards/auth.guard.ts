import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ROLE_HOME, Role } from '../models/types';

const forRoles =
  (...roles: Role[]): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);
    const role = auth.currentUser()!.role;
    if (roles.includes(role)) return true;
    return router.createUrlTree([ROLE_HOME[role] ?? '/login']);
  };
export const adminGuard = forRoles('admin');
export const teacherOrAdminGuard = forRoles('admin', 'teacher');
export const staffOrAdminGuard = forRoles('admin', 'staff');
export const managerGuard = forRoles('manager');
export const managementGuard = forRoles('admin', 'manager');
export const staffGuard = forRoles('staff');
export const callTaskGuard = forRoles('admin', 'manager', 'staff');
export const signedInGuard = forRoles('admin', 'manager', 'staff', 'teacher');
