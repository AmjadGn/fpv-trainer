import { Injectable } from '@angular/core';

export interface CompetitiveCacheEntry<T> {
  value: T;
  expiresAt: number;
  cachedAt: number;
}

export interface CachedCompetitiveValue<T> {
  value: T;
  stale: boolean;
  cachedAt: number;
}

@Injectable({ providedIn: 'root' })
export class CompetitiveCacheService {
  private readonly prefix = 'fpv.competitive.v1.';

  get<T>(key: string, allowStale = false): CachedCompetitiveValue<T> | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const entry = JSON.parse(localStorage.getItem(this.key(key)) ?? 'null') as CompetitiveCacheEntry<T> | null;
      if (!entry || !Number.isFinite(entry.expiresAt)) return null;
      const stale = entry.expiresAt <= Date.now();
      return stale && !allowStale ? null : { value: entry.value, stale, cachedAt: entry.cachedAt };
    } catch {
      this.remove(key);
      return null;
    }
  }

  set<T>(key: string, value: T, ttlMs = 5 * 60_000): void {
    if (typeof localStorage === 'undefined') return;
    const now = Date.now();
    localStorage.setItem(this.key(key), JSON.stringify({ value, cachedAt: now, expiresAt: now + ttlMs }));
  }

  remove(key: string): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(this.key(key));
  }

  clear(): void {
    if (typeof localStorage === 'undefined') return;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }
}
