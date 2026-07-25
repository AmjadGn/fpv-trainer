import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, map, Observable, of, tap } from 'rxjs';
import { AuthUser } from '../models/auth-user.model';
import { AuthSession, LoginCredentials, RegisterCredentials } from '../models/auth-session.model';
import { AuthApiService } from './auth-api.service';
import { AuthStorageService } from './auth-storage.service';
import { CompetitiveCacheService } from '../../cache/services/competitive-cache.service';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly api = inject(AuthApiService);
  private readonly storage = inject(AuthStorageService);
  private readonly competitiveCache = inject(CompetitiveCacheService);
  readonly user = signal<AuthUser | null>(null);
  readonly token = signal<string | null>(this.storage.getToken());
  readonly restoring = signal(false);
  readonly isAuthenticated = computed(() => !!this.user() && !!this.token());
  readonly isGuest = computed(() => !this.isAuthenticated());

  restoreSession(): Observable<AuthUser | null> {
    if (!this.token() || this.restoring()) return of(this.user());
    this.restoring.set(true);
    return this.api.me().pipe(
      tap((user) => this.user.set(user)),
      catchError(() => {
        this.clear();
        return of(null);
      }),
      finalize(() => this.restoring.set(false)),
    );
  }

  login(credentials: LoginCredentials): Observable<AuthSession> {
    return this.api.login(credentials).pipe(tap((session) => this.apply(session)));
  }

  register(credentials: RegisterCredentials): Observable<AuthSession> {
    return this.api.register(credentials).pipe(tap((session) => this.apply(session)));
  }

  logout(): Observable<void> {
    return this.api.logout().pipe(
      catchError(() => of(undefined)),
      tap(() => this.clear()),
      map(() => undefined),
    );
  }

  clear(): void {
    this.storage.clear();
    this.competitiveCache.clear();
    this.token.set(null);
    this.user.set(null);
  }

  private apply(session: AuthSession): void {
    this.storage.setToken(session.token);
    this.token.set(session.token);
    this.user.set(session.user);
  }
}
