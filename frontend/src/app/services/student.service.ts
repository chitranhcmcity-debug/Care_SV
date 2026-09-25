import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Student } from '../models/types';

/** Fields an operator can edit on a student record. */
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

/** Student records (management) and the shared timetable (every role). */
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

  classes(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/students/classes`);
  }

  timetable(): Observable<TimetableEntry[]> {
    return this.http.get<TimetableEntry[]>(`${this.baseUrl}/course-groups/timetable`);
  }
}
