import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

const ACCESS_KEY = 'fpv-trainer.alpha-access.v1';

export type AlphaAccessStatus = 'open' | 'code-required' | 'granted' | 'denied';

/**
 * Optional controlled alpha access. Landing and sign-in remain available.
 * Server remains authoritative when codes are validated remotely.
 */
@Injectable({ providedIn: 'root' })
export class AlphaAccessService {
  readonly status = signal<AlphaAccessStatus>(this.initialStatus());
  readonly lastError = signal<string | null>(null);

  requiresCode(): boolean {
    return environment.alphaAccessRequired && this.status() !== 'granted';
  }

  canEnterProduct(): boolean {
    if (!environment.alphaAccessRequired) return true;
    return this.status() === 'granted' || this.status() === 'open';
  }

  submitInviteCode(code: string): boolean {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      this.lastError.set('Enter an invitation code.');
      this.status.set('denied');
      return false;
    }
    // Client-side format check only — production validation must be server-side.
    if (!/^[A-Z0-9]{4,16}$/.test(normalized)) {
      this.lastError.set('That code looks invalid. Check it and try again.');
      this.status.set('denied');
      return false;
    }
    try {
      localStorage.setItem(
        ACCESS_KEY,
        JSON.stringify({ code: normalized, grantedAt: new Date().toISOString() }),
      );
    } catch {
      /* ignore */
    }
    this.lastError.set(null);
    this.status.set('granted');
    return true;
  }

  clear(): void {
    try {
      localStorage.removeItem(ACCESS_KEY);
    } catch {
      /* ignore */
    }
    this.status.set(environment.alphaAccessRequired ? 'code-required' : 'open');
  }

  private initialStatus(): AlphaAccessStatus {
    if (!environment.alphaAccessRequired) return 'open';
    try {
      const raw = localStorage.getItem(ACCESS_KEY);
      if (raw) return 'granted';
    } catch {
      /* ignore */
    }
    return 'code-required';
  }
}
