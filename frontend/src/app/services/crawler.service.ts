import { API_BASE_URL } from '../config/api';
import { inject, Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';
import { CrawlerProgress, Student } from '../models/types';

export interface CrawlerStreamEvent extends CrawlerProgress {
  batchFound?: Student[];
}

@Injectable({
  providedIn: 'root',
})
export class CrawlerService {
  private readonly sseUrl = inject(API_BASE_URL) + '/crawler/scan-progress';

  private readonly zone = inject(NgZone);

  startScan(
    years: string = '25,26',
    prefixes: string = '501,602,502,601,401,402,701',
    startSeq: number = 1,
    endSeq: number = 50,
    concurrency: number = 6,
  ): Observable<CrawlerStreamEvent> {
    return new Observable<CrawlerStreamEvent>((observer) => {
      const url = `${this.sseUrl}?years=${encodeURIComponent(years)}&prefixes=${encodeURIComponent(
        prefixes,
      )}&startSeq=${startSeq}&endSeq=${endSeq}&concurrency=${concurrency}`;

      const controller = new AbortController();
      const token = localStorage.getItem('itc_token');
      const run = async () => {
        const response = await fetch(url, {
          headers: token ? { Authorization: 'Bearer ' + token } : {},
          signal: controller.signal,
        });
        if (!response.ok || !response.body)
          throw new Error('Crawler request failed: ' + response.status);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
            let boundary: number;
            while ((boundary = buffer.indexOf('\n\n')) >= 0) {
              const frame = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const payload = frame
                .split('\n')
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).trimStart())
                .join('\n');
              if (!payload) continue;
              const data: CrawlerStreamEvent = JSON.parse(payload);
              this.zone.run(() => observer.next(data));
              if (data.completed) {
                this.zone.run(() => observer.complete());
                return;
              }
            }
          }
          this.zone.run(() => observer.complete());
        } finally {
          await reader.cancel();
        }
      };
      void run().catch((error) => {
        if (!controller.signal.aborted) this.zone.run(() => observer.error(error));
      });
      return () => controller.abort();
    });
  }
}
