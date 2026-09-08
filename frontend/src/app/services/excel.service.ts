import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ImportByCourseResult {
  message: string;
  totalStudents: number;
  newStudents: number;
  updatedStudents: number;
  assignedCount: number;
  sheetResults: {
    sheetName: string;
    courseName: string;
    total: number;
    newStudents: number;
    assigned: number;
  }[];
  errors?: string[];
}

@Injectable({
  providedIn: 'root',
})
export class ExcelService {
  private readonly apiUrl = inject(API_BASE_URL) + '/excel';

  private readonly http = inject(HttpClient);

  /** Xuất file mẫu cũ (theo lớp) */
  exportTemplate(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/export-template`, {
      responseType: 'blob',
    });
  }

  /** Xuất file mẫu MỚI (theo từng học phần đã cấu hình - mỗi sheet = 1 groupCode) */
  exportCourseTemplate(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/course-template`, {
      responseType: 'blob',
    });
  }

  /** Import cũ */
  importData(
    file: File,
  ): Observable<{ message: string; updatedCount: number; groupCreatedCount: number }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ message: string; updatedCount: number; groupCreatedCount: number }>(
      `${this.apiUrl}/import-data`,
      formData,
    );
  }

  /** Import MỚI theo học phần (mỗi sheet = 1 groupCode) */
  importByCourse(file: File): Observable<ImportByCourseResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ImportByCourseResult>(`${this.apiUrl}/import-by-course`, formData);
  }
}
