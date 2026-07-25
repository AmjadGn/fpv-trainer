import { inject, Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, concatMap, from, of, tap, toArray } from 'rxjs';
import { NetworkStatusService } from '../../network/network-status.service';
import { RaceApiService, RaceSubmission } from './race-api.service';

interface QueuedSubmission { payload: RaceSubmission; attempts: number; nextAttemptAt: number; }

@Injectable({ providedIn: 'root' })
export class PendingSubmissionQueueService {
  private readonly key = 'fpv.pending-submissions.v1';
  private readonly maxSize = 50;
  private readonly network = inject(NetworkStatusService);
  private readonly races = inject(RaceApiService);

  constructor() {
    this.network.pendingSubmissions.set(this.read().length);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.flush().subscribe());
    }
    if (this.network.online()) {
      queueMicrotask(() => this.flush().subscribe());
    }
  }

  enqueue(payload: RaceSubmission): void {
    const queue = this.read().filter((item) => item.payload.submissionId !== payload.submissionId);
    queue.push({ payload, attempts: 0, nextAttemptAt: Date.now() });
    this.write(queue.slice(-this.maxSize));
  }

  flush(): Observable<unknown[]> {
    if (!this.network.online()) return of([]);
    const due = this.read().filter((item) => item.nextAttemptAt <= Date.now());
    return from(due).pipe(
      concatMap((item) => this.races.submit(item.payload).pipe(
        tap(() => this.remove(item.payload.submissionId)),
        catchError((error: unknown) => {
          if (isPermanentSubmissionError(error)) {
            this.remove(item.payload.submissionId);
          } else {
            this.defer(item.payload.submissionId);
          }
          return of(null);
        }),
      )),
      toArray(),
      tap(() => this.network.pendingSubmissions.set(this.read().length)),
    );
  }

  count(): number { return this.read().length; }
  list(): ReadonlyArray<QueuedSubmission> { return this.read(); }
  deletePending(submissionId: string): void { this.remove(submissionId); }

  private defer(submissionId: string): void {
    this.write(this.read().map((item) => item.payload.submissionId === submissionId
      ? { ...item, attempts: item.attempts + 1, nextAttemptAt: Date.now() + 1_000 * 2 ** Math.min(item.attempts, 8) }
      : item));
  }
  private remove(submissionId: string): void { this.write(this.read().filter((item) => item.payload.submissionId !== submissionId)); }
  private read(): QueuedSubmission[] {
    try { return JSON.parse(localStorage.getItem(this.key) ?? '[]') as QueuedSubmission[]; } catch { return []; }
  }
  private write(items: QueuedSubmission[]): void {
    localStorage.setItem(this.key, JSON.stringify(items));
    this.network.pendingSubmissions.set(items.length);
  }
}

function isPermanentSubmissionError(error: unknown): boolean {
  return error instanceof HttpErrorResponse
    && error.status >= 400
    && error.status < 500
    && error.status !== 408
    && error.status !== 429;
}
