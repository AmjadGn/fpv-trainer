import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ApiClientService } from './api-client.service';
import { RaceSession, RaceSubmission } from '../models/race-submission.model';

@Injectable({ providedIn: 'root' })
export class ChallengeApiService extends ApiClientService {
  active(): Observable<unknown> {
    return this.http.get(`${this.apiUrl}/challenges/active`);
  }

  get(slug: string): Observable<unknown> {
    return this.http.get(`${this.apiUrl}/challenges/${encodeURIComponent(slug)}`);
  }

  startSession(slug: string): Observable<RaceSession> {
    return this.http.post<{ session: RaceSession }>(`${this.apiUrl}/challenges/${encodeURIComponent(slug)}/sessions`, {}).pipe(map((response) => response.session));
  }

  submit(slug: string, payload: RaceSubmission): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/challenges/${encodeURIComponent(slug)}/submissions`, payload);
  }

  leaderboard(slug: string, page = 1, perPage = 25): Observable<unknown> {
    return this.http.get(`${this.apiUrl}/challenges/${encodeURIComponent(slug)}/leaderboard`, { params: { page, perPage } });
  }
}
