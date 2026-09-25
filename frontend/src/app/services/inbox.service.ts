import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Work waiting for the user; `new` = appeared since they last opened the bell. */
export interface InboxSummary {
  callTasks: { pending: number; new: number };
  tasks: { pending: number; new: number };
  unseen: number;
}

/** Kinds of work; each is marked seen by the bell or by opening its page. */
export type InboxScope = 'callTasks' | 'tasks';

/** The header bell (GET /api/notifications). */
@Injectable({ providedIn: 'root' })
export class InboxService {
  private readonly apiUrl = inject(API_BASE_URL) + '/notifications';
  private readonly http = inject(HttpClient);

  summary(): Observable<InboxSummary> {
    return this.http.get<InboxSummary>(this.apiUrl);
  }

  /** Marks work as seen: one kind (its page was opened) or, without a scope, all (the bell). */
  markSeen(scope?: InboxScope): Observable<InboxSummary> {
    return this.http.put<InboxSummary>(`${this.apiUrl}/seen`, scope ? { scope } : {});
  }
}
