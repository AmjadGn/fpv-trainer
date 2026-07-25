import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from './api-client.service';

@Injectable({ providedIn: 'root' })
export class ProfileApiService extends ApiClientService {
  profile(): Observable<unknown> { return this.http.get(`${this.apiUrl}/profile`); }
  update(payload: Record<string, unknown>): Observable<unknown> { return this.http.patch(`${this.apiUrl}/profile`, payload); }
  deleteAccount(): Observable<void> { return this.http.delete<void>(`${this.apiUrl}/profile`); }
  export(): Observable<unknown> { return this.http.post(`${this.apiUrl}/profile/export`, {}); }
  runs(): Observable<unknown> { return this.http.get(`${this.apiUrl}/profile/runs`); }
  pilot(username: string): Observable<unknown> { return this.http.get(`${this.apiUrl}/pilots/${encodeURIComponent(username)}`); }
  share(runId: string): Observable<unknown> { return this.http.post(`${this.apiUrl}/results/${encodeURIComponent(runId)}/share`, {}); }
  updateVisibility(runId: string, visibility: string): Observable<unknown> { return this.http.patch(`${this.apiUrl}/results/${encodeURIComponent(runId)}/visibility`, { visibility }); }
  publicResult(publicId: string): Observable<unknown> { return this.http.get(`${this.apiUrl}/public/results/${encodeURIComponent(publicId)}`); }
  publicReplay(publicId: string): Observable<unknown> { return this.http.get(`${this.apiUrl}/public/replays/${encodeURIComponent(publicId)}`); }
}
