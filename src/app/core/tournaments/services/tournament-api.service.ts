import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../online/services/api-client.service';

export interface TournamentAttemptRequest {
  mode: 'practice' | 'ranked';
}

@Injectable({ providedIn: 'root' })
export class TournamentApiService extends ApiClientService {
  list(): Observable<unknown> { return this.http.get(`${this.apiUrl}/tournaments`); }
  get(slug: string): Observable<unknown> { return this.http.get(`${this.apiUrl}/tournaments/${encodeURIComponent(slug)}`); }
  attempt(slug: string, mode: 'practice' | 'ranked'): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/tournaments/${encodeURIComponent(slug)}/attempts`, { mode });
  }
  static attemptPayload(mode: 'practice' | 'ranked'): TournamentAttemptRequest {
    return { mode };
  }
}
