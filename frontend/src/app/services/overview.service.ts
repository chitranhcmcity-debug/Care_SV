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
  /** Hồ sơ chăm sóc đang chờ chỉ đạo / đang xử lý. */
  careCases: { awaiting: number; inProgress: number };
  /** Các cuộc gọi trong 7 ngày qua, theo kết quả. */
  callOutcomes: { answered: number; noAnswer: number; busy: number; unrecorded: number };
  /** Sinh viên ở mức cảnh báo: bao nhiêu, và vài người nặng nhất / gần nhất. */
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
  /** 7 ngày qua, cũ nhất trước; date là YYYY-MM-DD theo giờ của trường. */
  activity: {
    date: string;
    attendance: number;
    calls: number;
    /** Sinh viên có mặt / vắng có phép / vắng trong các buổi ghi nhận ngày đó. */
    students: { present: number; excused: number; absent: number };
    /** Số bản ghi tạo trong ngày đó. */
    created: { users: number; students: number; courseGroups: number; careCases: number };
  }[];
  callsWithRecording: number;
  integrations: { name: string; configured: boolean }[];
}

/** Trang đầu của admin: sức khỏe hệ thống trong một cái nhìn. */
@Injectable({ providedIn: 'root' })
export class OverviewService {
  private readonly apiUrl = inject(API_BASE_URL) + '/overview';
  private readonly http = inject(HttpClient);

  get(): Observable<SystemOverview> {
    return this.http.get<SystemOverview>(this.apiUrl);
  }
}
