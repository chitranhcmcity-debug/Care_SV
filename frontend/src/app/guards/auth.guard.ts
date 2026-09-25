import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Lets the user in when AuthService.canOpen allows the route's path; otherwise sends them
 *  to their landing page. Sessions without known permissions refresh them first. */
export const pageGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);
  const path = '/' + (route.routeConfig?.path ?? '');
  const decide = () => auth.canOpen(path) || router.createUrlTree([auth.homePath()]);
  if (auth.permissions() === null) return auth.refreshSession().pipe(map(decide));
  return decide();
};
