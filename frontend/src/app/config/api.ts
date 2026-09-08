import { InjectionToken } from '@angular/core';

/** Same-origin API; Angular's development proxy forwards requests to Express. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api',
});
