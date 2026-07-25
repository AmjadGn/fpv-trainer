import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthSession, LoginCredentials, RegisterCredentials } from '../models/auth-session.model';
import { AuthUser } from '../models/auth-user.model';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/auth`;

  register(credentials: RegisterCredentials): Observable<AuthSession> {
    const { passwordConfirmation, ...payload } = credentials;
    return this.http.post<AuthSession>(`${this.baseUrl}/register`, {
      ...payload,
      password_confirmation: passwordConfirmation,
    });
  }

  login(credentials: LoginCredentials): Observable<AuthSession> {
    return this.http.post<AuthSession>(`${this.baseUrl}/login`, credentials);
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout`, {});
  }

  me(): Observable<AuthUser> {
    return this.http.get<{ user: AuthUser }>(`${this.baseUrl}/me`).pipe(map((response) => response.user));
  }

  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/forgot-password`, { email });
  }

  resetPassword(payload: { email: string; token: string; password: string; passwordConfirmation: string }): Observable<void> {
    const { passwordConfirmation, ...rest } = payload;
    return this.http.post<void>(`${this.baseUrl}/reset-password`, { ...rest, password_confirmation: passwordConfirmation });
  }
}
