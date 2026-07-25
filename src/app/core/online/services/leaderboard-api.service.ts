import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from './api-client.service';

export interface LeaderboardQuery {
  weatherCategory?: string;
  period?: string;
  page?: number;
  perPage?: number;
}

@Injectable({ providedIn: 'root' })
export class LeaderboardApiService extends ApiClientService {
  forCourse(courseId: string, query: LeaderboardQuery = {}): Observable<unknown> {
    const params = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined)) as Record<string, string | number>;
    return this.http.get(`${this.apiUrl}/leaderboards/courses/${encodeURIComponent(courseId)}`, { params });
  }

  aroundMe(courseId: string, window = 5): Observable<unknown> {
    return this.http.get(`${this.apiUrl}/leaderboards/around-me`, { params: { courseId, window } });
  }
}
