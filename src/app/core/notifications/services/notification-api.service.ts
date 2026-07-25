import { inject, Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { ApiClientService } from '../../online/services/api-client.service';
import { AuthSessionService } from '../../auth/services/auth-session.service';

export interface AppNotification {
  id: string;
  title: string;
  body?: string;
  readAt?: string | null;
  createdAt?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationApiService extends ApiClientService {
  private readonly auth = inject(AuthSessionService);
  readonly notifications = signal<AppNotification[]>([]);
  readonly unreadCount = signal(0);

  fetch(): Observable<AppNotification[]> {
    if (!this.auth.isAuthenticated()) return of([]);
    return this.http.get<{ notifications?: AppNotification[]; unreadCount?: number }>(`${this.apiUrl}/notifications`).pipe(
      tap((response) => {
        const notifications = response.notifications ?? [];
        this.notifications.set(notifications);
        this.unreadCount.set(response.unreadCount ?? notifications.filter((item) => !item.readAt).length);
      }),
      map((response) => response.notifications ?? []),
      catchError(() => of([])),
    );
  }

  markRead(id: string): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/notifications/${encodeURIComponent(id)}/read`, {}).pipe(tap(() => this.fetch().subscribe()));
  }
}
