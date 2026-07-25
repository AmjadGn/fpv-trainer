import { Injectable, signal } from '@angular/core';

const CONSENT_KEY = 'fpv-trainer.analytics-consent.v1';

export type AnalyticsConsentState = 'unknown' | 'granted' | 'denied';

interface StoredConsent {
  version: 1;
  analytics: AnalyticsConsentState;
  errorReporting: AnalyticsConsentState;
  personalization: AnalyticsConsentState;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsConsentService {
  private readonly state = signal<StoredConsent>(this.read());

  readonly analytics = signal(this.state().analytics);
  readonly errorReporting = signal(this.state().errorReporting);
  readonly personalization = signal(this.state().personalization);

  canTrackAnalytics(): boolean {
    // Essential flight does not require analytics. Unknown = no remote analytics.
    return this.analytics() === 'granted';
  }

  canReportErrors(): boolean {
    // Default allow error reporting in alpha unless explicitly denied.
    return this.errorReporting() !== 'denied';
  }

  setAnalytics(value: AnalyticsConsentState): void {
    this.analytics.set(value);
    this.persist();
  }

  setErrorReporting(value: AnalyticsConsentState): void {
    this.errorReporting.set(value);
    this.persist();
  }

  setPersonalization(value: AnalyticsConsentState): void {
    this.personalization.set(value);
    this.persist();
  }

  private persist(): void {
    const next: StoredConsent = {
      version: 1,
      analytics: this.analytics(),
      errorReporting: this.errorReporting(),
      personalization: this.personalization(),
      updatedAt: new Date().toISOString(),
    };
    this.state.set(next);
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(next));
    } catch {
      /* quota / private mode */
    }
  }

  private read(): StoredConsent {
    const fallback: StoredConsent = {
      version: 1,
      analytics: 'unknown',
      errorReporting: 'unknown',
      personalization: 'unknown',
      updatedAt: new Date().toISOString(),
    };
    try {
      const raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<StoredConsent>;
      return {
        version: 1,
        analytics: parsed.analytics ?? 'unknown',
        errorReporting: parsed.errorReporting ?? 'unknown',
        personalization: parsed.personalization ?? 'unknown',
        updatedAt: parsed.updatedAt ?? fallback.updatedAt,
      };
    } catch {
      return fallback;
    }
  }
}
