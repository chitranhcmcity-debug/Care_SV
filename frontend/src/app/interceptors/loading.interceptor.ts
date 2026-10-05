import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

/** Đếm các request GET mà một trang bắn ra khi mở, để loader logo bao phủ các lần tải dữ liệu chậm. */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(LoadingService);
  if (req.method !== 'GET' || !loading.isPageLoad()) return next(req);
  loading.start();
  return next(req).pipe(finalize(() => loading.stop()));
};
