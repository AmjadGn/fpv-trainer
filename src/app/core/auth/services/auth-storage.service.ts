import { Injectable } from '@angular/core';

/**
 * A session token is intentionally kept only in sessionStorage. This reduces
 * persistence, but does not protect against XSS; production still needs a CSP.
 */
@Injectable({ providedIn: 'root' })
export class AuthStorageService {
  private readonly tokenKey = 'fpv.auth.token';

  getToken(): string | null {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(this.tokenKey);
  }

  setToken(token: string): void {
    sessionStorage.setItem(this.tokenKey, token);
  }

  clear(): void {
    sessionStorage.removeItem(this.tokenKey);
  }
}
