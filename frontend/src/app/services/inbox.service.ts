import { API_BASE_URL } from '../config/api';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Work waiting for the user; `new` = appeared since they last opened the bell. */
export interface InboxSummary {
  callTasks: { pending: number; new: number };
  tasks: { pending: number; new: number };
  unseen: number;
  seenAt: string | null;
}

/** The header bell (GET /api/notifications). */
@Injectable({ providedIn: 'root' })
export class InboxService {
  private readonly apiUrl = inject(API_BASE_URL) + '/notifications';
  private readonly http = inject(HttpClient);

  summary(): Observable<InboxSummary> {
    return this.http.get<InboxSummary>(this.apiUrl);
  }

  /** The user opened the bell: everything so far counts as seen. */
  markSeen(): Observable<InboxSummary> {
    return this.http.put<InboxSummary>(`${this.apiUrl}/seen`, {});
  }
}
