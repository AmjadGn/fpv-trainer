import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../online/services/api-client.service';

@Injectable({ providedIn: 'root' })
export class MissionApiService extends ApiClientService {
  list(): Observable<unknown> { return this.http.get(`${this.apiUrl}/missions`); }
}
