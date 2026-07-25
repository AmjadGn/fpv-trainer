import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../online/services/api-client.service';

export interface LoadoutPayload {
  frame?: string;
  prop?: string;
  trail?: string;
}

@Injectable({ providedIn: 'root' })
export class CosmeticApiService extends ApiClientService {
  catalog(): Observable<unknown> { return this.http.get(`${this.apiUrl}/cosmetics`); }
  loadout(): Observable<unknown> { return this.http.get(`${this.apiUrl}/profile/loadout`); }
  equip(payload: LoadoutPayload): Observable<unknown> {
    return this.http.put(`${this.apiUrl}/profile/loadout`, payload);
  }
}
