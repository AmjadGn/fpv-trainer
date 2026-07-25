import { computed, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly reconnecting = signal(false);
  readonly apiUnavailable = signal(false);
  readonly authenticated = signal(false);
  readonly sessionExpired = signal(false);
  readonly pendingSubmissions = signal(0);
  readonly offline = computed(() => !this.online());

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.online.set(true);
        this.reconnecting.set(true);
      });
      window.addEventListener('offline', () => {
        this.online.set(false);
        this.reconnecting.set(false);
      });
    }
  }

  markReconnected(): void {
    this.reconnecting.set(false);
    this.apiUnavailable.set(false);
  }
}
