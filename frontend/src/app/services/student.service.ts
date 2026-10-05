import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Student, Student360Profile } from '../models/types';

/** Các trường người vận hành có thể sửa trên hồ sơ sinh viên. */
export type StudentInput = Pick<
  Student,
  'studentCode' | 'fullName' | 'classCode' | 'dob' | 'major' | 'phone' | 'parentPhone'
>;

export interface TimetableEntry {
  _id: string;
  groupCode: string;
  courseCode?: string;
  courseName?: string;
  shift?: 'sang' | 'chieu' | 'toi';
  scheduleDays?: string[];
  room?: string;
  startTime?: string;
  endTime?: string;
  startDate?: string | null;
  endDate?: string | null;
  teacherName?: string;
  studentCount: number;
  isMine: boolean;
}

/** Hồ sơ sinh viên (quản lý) và thời khóa biểu dùng chung (mọi vai trò). */
@Injectable({ providedIn: 'root' })
export class StudentService {
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);

  list(query: { search?: string; classCode?: string; page?: number; limit?: number }): Observable<{
    items: Student[];
    total: number;
    page: number;
    limit: number;
  }> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    return this.http.get<{ items: Student[]; total: number; page: number; limit: number }>(
      `${this.baseUrl}/students`,
      { params },
    );
  }

  create(data: StudentInput): Observable<Student> {
    return this.http.post<Student>(`${this.baseUrl}/students`, data);
  }

  update(id: string, data: StudentInput): Observable<Student> {
    return this.http.put<Student>(`${this.baseUrl}/students/${id}`, data);
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/students/${id}`);
  }

  /** Dòng thời gian 360°: vắng học, hồ sơ chăm sóc và cuộc gọi. */
  profile(id: string): Observable<Student360Profile> {
    return this.http.get<Student360Profile>(`${this.baseUrl}/students/${id}/profile`);
  }

  updateTags(id: string, tags: string[]): Observable<{ message: string; tags: string[] }> {
    return this.http.put<{ message: string; tags: string[] }>(
      `${this.baseUrl}/students/${id}/tags`,
      { tags },
    );
  }

  classes(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/students/classes`);
  }

  timetable(): Observable<TimetableEntry[]> {
    return this.http.get<TimetableEntry[]>(`${this.baseUrl}/course-groups/timetable`);
  }
}
