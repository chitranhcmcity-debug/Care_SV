import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SystemSettings } from '../models/types';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private readonly apiUrl = inject(API_BASE_URL) + '/settings';

  private readonly http = inject(HttpClient);

  getSettings(): Observable<SystemSettings> {
    return this.http.get<SystemSettings>(this.apiUrl);
  }

  updateSettings(
    settings: Partial<SystemSettings>,
  ): Observable<{ message: string; settings: SystemSettings }> {
    return this.http.put<{ message: string; settings: SystemSettings }>(this.apiUrl, settings);
  }
}
