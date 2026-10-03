import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_BASE_URL } from '../config/api';
import { AuthService } from '../services/auth.service';
import { BillingService } from '../services/billing.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const baseUrl = inject(API_BASE_URL);
  const auth = inject(AuthService);
  const router = inject(Router);
  const billing = inject(BillingService);
  const token = auth.token();
  const isApiRequest = req.url === baseUrl || req.url.startsWith(baseUrl + '/');
  if (token && isApiRequest) {
    const authReq = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`),
    });
    return next(authReq).pipe(
      catchError((error) => {
        if (error.status === 401) {
          auth.logout();
          // A Trưởng phòng / PHT whose own plan ran out: the login page explains how to renew.
          if (error.error?.code === 'ACCOUNT_EXPIRED')
            router.navigate(['/login'], { queryParams: { expired: 1 } });
        }
        // Subscription expired: refresh the banner, and send whoever can renew to the billing page.
        if (error.status === 402) {
          billing.refreshStatus().subscribe({ error: () => {} });
          if (auth.isManager() && !router.url.startsWith('/billing')) router.navigate(['/billing']);
        }
        return throwError(() => error);
      }),
    );
  }
  return next(req);
};
