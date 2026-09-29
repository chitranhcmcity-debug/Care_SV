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
  /** Care cases waiting for a directive / being worked on. */
  careCases: { awaiting: number; inProgress: number };
  /** Calls made in the last 7 days, by how they went. */
  callOutcomes: { answered: number; noAnswer: number; busy: number; unrecorded: number };
  /** Students at a warning level: how many, and the most severe / most recent few. */
  warnings: {
    count: number;
    items: {
      student: { _id: string; studentCode: string; fullName: string };
      groupCode: string;
      level: string;
      color: string;
      examBan: boolean;
      absentPeriods: number;
      lastAbsence: string;
    }[];
  };
  /** Last 7 days, oldest first; date is YYYY-MM-DD in school time. */
  activity: {
    date: string;
    attendance: number;
    calls: number;
    /** Students present / excused / absent in the sessions recorded that day. */
    students: { present: number; excused: number; absent: number };
    /** Records created that day. */
    created: { users: number; students: number; courseGroups: number; careCases: number };
  }[];
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
