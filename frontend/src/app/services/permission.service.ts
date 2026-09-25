import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PermissionConfig, PermissionMatrix } from '../models/types';

/** Admin-only: the role → permission matrix. */
@Injectable({
  providedIn: 'root',
})
export class PermissionService {
  private readonly apiUrl = inject(API_BASE_URL) + '/permissions';

  private readonly http = inject(HttpClient);

  getConfig(): Observable<PermissionConfig> {
    return this.http.get<PermissionConfig>(this.apiUrl);
  }

  updateMatrix(
    matrix: Partial<PermissionMatrix>,
  ): Observable<PermissionConfig & { message: string }> {
    return this.http.put<PermissionConfig & { message: string }>(this.apiUrl, { matrix });
  }
}
