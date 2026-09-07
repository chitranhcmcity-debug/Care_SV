import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SystemSettings } from '../models/types';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private get apiUrl(): string {
    const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
    return `http://${host}:5000/api/settings`;
  }

  constructor(private http: HttpClient) {}

  getSettings(): Observable<SystemSettings> {
    return this.http.get<SystemSettings>(this.apiUrl);
  }

  updateSettings(settings: Partial<SystemSettings>): Observable<{ message: string; settings: SystemSettings }> {
    return this.http.put<{ message: string; settings: SystemSettings }>(this.apiUrl, settings);
  }
}
