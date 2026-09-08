import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { API_BASE_URL } from '../config/api';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const baseUrl = inject(API_BASE_URL);
  const auth = inject(AuthService);
  const token = auth.token();
  const isApiRequest = req.url === baseUrl || req.url.startsWith(baseUrl + '/');
  if (token && isApiRequest) {
    const authReq = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`),
    });
    return next(authReq).pipe(
      catchError((error) => {
        if (error.status === 401) auth.logout();
        return throwError(() => error);
      }),
    );
  }
  return next(req);
};
