import { InjectionToken } from '@angular/core';

/** API cùng origin; proxy phát triển của Angular chuyển tiếp request tới Express. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api',
});
