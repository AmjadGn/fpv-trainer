import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ApiClientService } from './api-client.service';
import { RaceRun, RaceSession, RaceSubmission } from '../models/race-submission.model';

export type { RaceRun, RaceSession, RaceSubmission } from '../models/race-submission.model';

@Injectable({ providedIn: 'root' })
export class RaceApiService extends ApiClientService {
  startSession(payload: { courseId: string; weatherPresetId: string; clientBuildVersion?: string; physicsVersion?: string }): Observable<RaceSession> {
    return this.http.post<{ session: RaceSession }>(`${this.apiUrl}/race-sessions`, payload).pipe(
      // Laravel wraps the resource to leave room for response metadata.
      map((response) => response.session),
    );
  }

  submit(payload: RaceSubmission): Observable<RaceRun> {
    return this.http.post<{ run: RaceRun }>(`${this.apiUrl}/race-submissions`, payload).pipe(map((response) => response.run));
  }

  submission(submissionId: string): Observable<RaceRun> {
    return this.http.get<{ run: RaceRun }>(`${this.apiUrl}/race-submissions/${encodeURIComponent(submissionId)}`).pipe(map((response) => response.run));
  }
}
