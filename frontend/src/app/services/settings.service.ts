import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { IntegrationItem, SystemSettings, WarningLevel } from '../models/types';

export type Branding = Pick<
  SystemSettings,
  | 'systemTitle'
  | 'schoolName'
  | 'departmentName'
  | 'supportHotline'
  | 'supportEmail'
  | 'logoDataUrl'
  | 'primaryColor'
>;

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private readonly apiUrl = inject(API_BASE_URL) + '/settings';

  private readonly http = inject(HttpClient);

  getSettings(): Observable<SystemSettings> {
    return this.http.get<SystemSettings>(this.apiUrl);
  }

  /** Admin: nhận diện hệ thống và giao diện web. */
  updateSettings(
    settings: Partial<SystemSettings>,
  ): Observable<{ message: string; settings: SystemSettings }> {
    return this.http.put<{ message: string; settings: SystemSettings }>(this.apiUrl, settings);
  }

  /** Trưởng phòng / PHT: mức cảnh báo, lý do vắng và nhãn. */
  updateCareSettings(payload: {
    warningLevels?: WarningLevel[];
    absenceReasons?: string[];
    tags?: string[];
  }): Observable<{ message: string; settings: SystemSettings }> {
    return this.http.put<{ message: string; settings: SystemSettings }>(
      `${this.apiUrl}/care`,
      payload,
    );
  }

  /** Công khai: tên, logo và màu (cũng dùng ở trang đăng nhập). */
  getBranding(): Observable<Partial<Branding>> {
    return this.http.get<Partial<Branding>>(`${this.apiUrl}/branding`);
  }

  /** Admin: khóa API (bí mật trả về dạng che). */
  getIntegrations(): Observable<IntegrationItem[]> {
    return this.http.get<IntegrationItem[]>(`${this.apiUrl}/integrations`);
  }

  updateIntegrations(
    values: Record<string, string>,
  ): Observable<{ message: string; items: IntegrationItem[] }> {
    return this.http.put<{ message: string; items: IntegrationItem[] }>(
      `${this.apiUrl}/integrations`,
      { values },
    );
  }
}
