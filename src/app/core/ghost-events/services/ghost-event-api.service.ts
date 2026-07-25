import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../online/services/api-client.service';

@Injectable({ providedIn: 'root' })
export class GhostEventApiService extends ApiClientService {
  list(): Observable<unknown> { return this.http.get(`${this.apiUrl}/ghost-events`); }
  get(slug: string): Observable<unknown> { return this.http.get(`${this.apiUrl}/ghost-events/${encodeURIComponent(slug)}`); }
  start(slug: string, ranked: boolean, ghostIds: string[]): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/ghost-events/${encodeURIComponent(slug)}/sessions`, { ranked, ghostIds });
  }
}
