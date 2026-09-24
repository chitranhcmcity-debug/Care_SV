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
        if (error.status === 401) auth.logout();
        // Subscription expired: refresh the banner, and send an admin to the renewal page.
        if (error.status === 402) {
          billing.refreshStatus().subscribe({ error: () => {} });
          if (auth.isAdmin() && !router.url.startsWith('/billing')) router.navigate(['/billing']);
        }
        return throwError(() => error);
      }),
    );
  }
  return next(req);
};
