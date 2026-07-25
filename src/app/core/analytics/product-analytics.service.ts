import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthSessionService } from '../auth/services/auth-session.service';
import { NetworkStatusService } from '../network/network-status.service';
import { TrainerSettingsService } from '../settings/services/trainer-settings.service';
import { SelectedAircraftService } from '../aircraft/services/selected-aircraft.service';
import type { AnalyticsContext } from './analytics-context';
import { AnalyticsConsentService } from './analytics-consent.service';
import type { AnalyticsEventName } from './analytics-events';
import type { AnalyticsProvider } from './analytics-provider.interface';

const SESSION_KEY = 'fpv-trainer.analytics-session.v1';

class ConsoleAnalyticsProvider implements AnalyticsProvider {
  readonly id = 'console';
  track(
    event: string,
    properties: Record<string, unknown>,
    context: AnalyticsContext,
  ): void {
    if (!environment.production) {
      console.info('[FPV analytics]', event, properties, {
        session: context.anonymousSessionId.slice(0, 8),
        guest: !context.authenticated,
      });
    }
  }
}

@Injectable({ providedIn: 'root' })
export class ProductAnalyticsService {
  private readonly consent = inject(AnalyticsConsentService);
  private readonly auth = inject(AuthSessionService);
  private readonly network = inject(NetworkStatusService);
  private readonly settings = inject(TrainerSettingsService);
  private readonly aircraft = inject(SelectedAircraftService);

  private readonly providers: AnalyticsProvider[] = [new ConsoleAnalyticsProvider()];
  private readonly sessionId = this.ensureSessionId();

  readonly lastEvent = signal<string | null>(null);

  /** Optional runtime context overrides for the current session. */
  private mode: string | null = null;
  private controlMethod: string | null = null;
  private experienceLevel: string | null = null;
  private performanceCategory: string | null = null;

  setMode(mode: string | null): void {
    this.mode = mode;
  }

  setControlMethod(method: string | null): void {
    this.controlMethod = method;
  }

  setExperienceLevel(level: string | null): void {
    this.experienceLevel = level;
  }

  setPerformanceCategory(category: string | null): void {
    this.performanceCategory = category;
  }

  track(event: AnalyticsEventName | string, properties: Record<string, unknown> = {}): void {
    if (!environment.analyticsEnabled) return;
    if (!this.consent.canTrackAnalytics() && environment.production) return;

    const safeProps = sanitizeProperties(properties);
    const context = this.buildContext();
    this.lastEvent.set(event);
    for (const provider of this.providers) {
      try {
        provider.track(event, safeProps, context);
      } catch {
        /* never break product for analytics */
      }
    }
  }

  private buildContext(): AnalyticsContext {
    return {
      anonymousSessionId: this.sessionId,
      authenticated: this.auth.isAuthenticated(),
      appVersion: environment.appVersion,
      buildId: environment.buildId,
      releaseChannel: environment.releaseChannel,
      browserFamily: detectBrowserFamily(),
      deviceClass: detectDeviceClass(),
      qualityPreset: this.settings.environmentSettings().quality,
      aircraftId: this.aircraft.selectedAircraftId() ?? null,
      environmentId: this.settings.environmentSettings().selectedEnvironmentId ?? null,
      mode: this.mode,
      controlMethod: this.controlMethod,
      experienceLevel: this.experienceLevel,
      performanceCategory: this.performanceCategory,
      networkOnline: this.network.online(),
    };
  }

  private ensureSessionId(): string {
    try {
      const existing = localStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(SESSION_KEY, id);
      return id;
    } catch {
      return `s-ephemeral-${Date.now().toString(36)}`;
    }
  }
}

const SENSITIVE_KEYS = /token|password|secret|authorization|cookie|serial|raw.?input|replay.?data/i;

function sanitizeProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (SENSITIVE_KEYS.test(key)) continue;
    if (typeof value === 'string' && value.length > 500) {
      out[key] = `${value.slice(0, 500)}…`;
      continue;
    }
    out[key] = value;
  }
  return out;
}

function detectBrowserFamily(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'edge';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'chrome';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'safari';
  return 'other';
}

function detectDeviceClass(): AnalyticsContext['deviceClass'] {
  if (typeof window === 'undefined') return 'unknown';
  const w = window.innerWidth;
  if (w < 640) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}
