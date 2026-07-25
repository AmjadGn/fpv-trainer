import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  protected readonly http = inject(HttpClient);
  protected readonly apiUrl = environment.apiBaseUrl;
}
