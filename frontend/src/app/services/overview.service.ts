import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Role, User } from '../models/types';
import { SubscriptionStatus } from './billing.service';

export interface SystemOverview {
  subscription: SubscriptionStatus;
  users: {
    total: number;
    byRole: Partial<Record<Role, number>>;
    byStatus: Partial<Record<User['status'], number>>;
    recent: (Pick<User, '_id' | 'fullName' | 'email' | 'role' | 'status'> & {
      createdAt: string;
    })[];
  };
  data: {
    students: number;
    classes: number;
    classesWithoutStaff: number;
    courseGroups: number;
    groupsWithoutTeacher: number;
  };
  callTasks: { open: number; contacted: number };
  /** Last 7 days, oldest first; date is YYYY-MM-DD in school time. */
  activity: { date: string; attendance: number; calls: number }[];
  callsWithRecording: number;
  integrations: { name: string; configured: boolean }[];
}

/** Admin landing page: system health at a glance. */
@Injectable({ providedIn: 'root' })
export class OverviewService {
  private readonly apiUrl = inject(API_BASE_URL) + '/overview';
  private readonly http = inject(HttpClient);

  get(): Observable<SystemOverview> {
    return this.http.get<SystemOverview>(this.apiUrl);
  }
}
