import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

/** Counts the GET requests a page fires while opening, so the logo loader covers slow data loads. */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(LoadingService);
  if (req.method !== 'GET' || !loading.isPageLoad()) return next(req);
  loading.start();
  return next(req).pipe(finalize(() => loading.stop()));
};
