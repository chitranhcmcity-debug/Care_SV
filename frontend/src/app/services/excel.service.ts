import { Injectable } from '@angular/core';
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
  private get apiUrl(): string {
    const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
    return `http://${host}:5000/api/excel`;
  }

  constructor(private http: HttpClient) {}

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
  importData(file: File): Observable<{ message: string; updatedCount: number; groupCreatedCount: number }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ message: string; updatedCount: number; groupCreatedCount: number }>(
      `${this.apiUrl}/import-data`,
      formData
    );
  }

  /** Import MỚI theo học phần (mỗi sheet = 1 groupCode) */
  importByCourse(file: File): Observable<ImportByCourseResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ImportByCourseResult>(`${this.apiUrl}/import-by-course`, formData);
  }
}
