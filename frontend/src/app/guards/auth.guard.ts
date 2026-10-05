import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Cho người dùng vào khi AuthService.canOpen cho phép đường dẫn của route; nếu không thì đưa họ
 *  về trang đầu của họ. Phiên chưa biết quyền sẽ làm mới quyền trước. */
export const pageGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // Nhớ trang (vd link duyệt trong email của quản lý) để quay lại sau khi đăng nhập.
  if (!auth.isLoggedIn())
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  const path = '/' + (route.routeConfig?.path ?? '');
  const decide = () => auth.canOpen(path) || router.createUrlTree([auth.homePath()]);
  if (auth.permissions() === null) return auth.refreshSession().pipe(map(decide));
  return decide();
};
