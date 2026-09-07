import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CourseGroup } from '../models/types';

@Injectable({
  providedIn: 'root',
})
export class CourseGroupService {
  private get apiUrl(): string {
    const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
    return `http://${host}:5000/api/course-groups`;
  }

  constructor(private http: HttpClient) {}

  getCourseGroups(shift?: string, search?: string): Observable<CourseGroup[]> {
    let params = new HttpParams();
    if (shift) params = params.set('shift', shift);
    if (search) params = params.set('search', search);

    return this.http.get<CourseGroup[]>(this.apiUrl, { params });
  }

  createCourseGroup(payload: Partial<CourseGroup>): Observable<{ message: string; group: CourseGroup }> {
    return this.http.post<{ message: string; group: CourseGroup }>(this.apiUrl, payload);
  }

  updateCourseGroup(id: string, payload: Partial<CourseGroup>): Observable<{ message: string; group: CourseGroup }> {
    return this.http.put<{ message: string; group: CourseGroup }>(`${this.apiUrl}/${id}`, payload);
  }

  deleteCourseGroup(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  assignStudent(
    groupId: string,
    payload: { studentCode?: string; studentId?: string }
  ): Observable<{ message: string; group: CourseGroup }> {
    return this.http.post<{ message: string; group: CourseGroup }>(
      `${this.apiUrl}/${groupId}/assign-student`,
      payload
    );
  }

  removeStudent(groupId: string, studentId: string): Observable<{ message: string; group: CourseGroup }> {
    return this.http.delete<{ message: string; group: CourseGroup }>(
      `${this.apiUrl}/${groupId}/remove-student/${studentId}`
    );
  }

  assignClass(groupId: string, classCode: string): Observable<{ message: string; group: CourseGroup; addedCount: number }> {
    return this.http.post<{ message: string; group: CourseGroup; addedCount: number }>(
      `${this.apiUrl}/${groupId}/assign-class`,
      { classCode }
    );
  }
}
