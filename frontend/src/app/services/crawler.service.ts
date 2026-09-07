import { Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';
import { CrawlerProgress, Student } from '../models/types';

export interface CrawlerStreamEvent extends CrawlerProgress {
  batchFound?: Student[];
}

@Injectable({
  providedIn: 'root',
})
export class CrawlerService {
  private get sseUrl(): string {
    const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
    return `http://${host}:5000/api/crawler/scan-progress`;
  }

  constructor(private zone: NgZone) {}

  startScan(
    years: string = '25,26',
    prefixes: string = '501,602,502,601,401,402,701',
    startSeq: number = 1,
    endSeq: number = 50,
    concurrency: number = 6
  ): Observable<CrawlerStreamEvent> {
    return new Observable<CrawlerStreamEvent>((observer) => {
      const url = `${this.sseUrl}?years=${encodeURIComponent(years)}&prefixes=${encodeURIComponent(
        prefixes
      )}&startSeq=${startSeq}&endSeq=${endSeq}&concurrency=${concurrency}`;

      const eventSource = new EventSource(url);

      eventSource.onmessage = (event) => {
        this.zone.run(() => {
          try {
            const data: CrawlerStreamEvent = JSON.parse(event.data);
            observer.next(data);
            if (data.completed) {
              eventSource.close();
              observer.complete();
            }
          } catch (err) {
            observer.error(err);
          }
        });
      };

      eventSource.onerror = (error) => {
        this.zone.run(() => {
          observer.error(error);
          eventSource.close();
        });
      };

      // Cleanup on unsubscribe / abort
      return () => {
        eventSource.close();
      };
    });
  }
}
