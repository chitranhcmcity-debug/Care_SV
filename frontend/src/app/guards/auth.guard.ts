import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn() && authService.isAdmin()) {
    return true;
  }

  if (authService.isTeacher()) {
    router.navigate(['/attendance']);
  } else if (authService.isStaff()) {
    router.navigate(['/call-tasks']);
  } else {
    router.navigate(['/login']);
  }
  return false;
};

export const teacherOrAdminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn() && (authService.isTeacher() || authService.isAdmin())) {
    return true;
  }

  if (authService.isStaff()) {
    router.navigate(['/call-tasks']);
  } else {
    router.navigate(['/login']);
  }
  return false;
};

export const staffOrAdminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn() && (authService.isStaff() || authService.isAdmin())) {
    return true;
  }

  if (authService.isTeacher()) {
    router.navigate(['/attendance']);
  } else {
    router.navigate(['/login']);
  }
  return false;
};
