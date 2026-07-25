import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from './api-client.service';

export interface SyncDocument { updatedAt?: string; progress: Record<string, unknown>; }

@Injectable({ providedIn: 'root' })
export class ProgressSyncService extends ApiClientService {
  get(): Observable<SyncDocument> {
    return this.http.get<SyncDocument>(`${this.apiUrl}/progress`);
  }

  mergeRemote(payload: SyncDocument): Observable<SyncDocument> {
    return this.http.post<SyncDocument>(`${this.apiUrl}/progress/merge`, payload);
  }

  sync(payload: SyncDocument): Observable<SyncDocument> {
    return this.http.post<SyncDocument>(`${this.apiUrl}/progress/sync`, payload);
  }

  merge(local: SyncDocument, remote: SyncDocument): SyncDocument {
    const localTime = Date.parse(local.updatedAt ?? '') || 0;
    const remoteTime = Date.parse(remote.updatedAt ?? '') || 0;
    return {
      updatedAt: new Date(Math.max(localTime, remoteTime, Date.now())).toISOString(),
      progress: { ...local.progress, ...remote.progress },
    };
  }
}
