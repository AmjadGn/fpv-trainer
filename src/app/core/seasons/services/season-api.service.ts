import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../online/services/api-client.service';

@Injectable({ providedIn: 'root' })
export class SeasonApiService extends ApiClientService {
  current(): Observable<unknown> { return this.http.get(`${this.apiUrl}/seasons/current`); }
  leaderboard(seasonId?: string): Observable<unknown> {
    return this.http.get(`${this.apiUrl}/seasons/${encodeURIComponent(seasonId ?? 'current')}/leaderboard`);
  }
  history(): Observable<unknown> { return this.http.get(`${this.apiUrl}/seasons/history`); }
  rewards(seasonId?: string): Observable<unknown> {
    return this.http.get(`${this.apiUrl}/seasons/${encodeURIComponent(seasonId ?? 'current')}/rewards`);
  }
}
