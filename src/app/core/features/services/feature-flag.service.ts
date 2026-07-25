import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiClientService } from '../../online/services/api-client.service';
import { CompetitiveCacheService } from '../../cache/services/competitive-cache.service';

/** Competitive + product feature flags for alpha. */
export interface FeatureFlags {
  maintenanceMode: boolean;
  seasonsEnabled: boolean;
  tournamentsEnabled: boolean;
  ghostEventsEnabled: boolean;
  missionsEnabled: boolean;
  cosmeticsEnabled: boolean;
  notificationsEnabled: boolean;
  onboardingV1: boolean;
  guestMode: boolean;
  droneHangar: boolean;
  aircraftComparison: boolean;
  testFlight: boolean;
  trainingAcademy: boolean;
  ghostRacing: boolean;
  leaderboards: boolean;
  adaptiveGraphics: boolean;
  analytics: boolean;
  errorReporting: boolean;
  feedback: boolean;
  cloudSync: boolean;
  experimentalAircraft: boolean;
}

const CHANNEL_DEFAULTS: Record<string, Partial<FeatureFlags>> = {
  development: { feedback: true, guestMode: true, onboardingV1: true, experimentalAircraft: true },
  internal: { feedback: true, guestMode: true, onboardingV1: true },
  alpha: { feedback: true, guestMode: true, onboardingV1: true },
  beta: { feedback: true, guestMode: true, onboardingV1: true },
  production: { feedback: true, guestMode: true, onboardingV1: true, experimentalAircraft: false },
};

const DEFAULT_FLAGS: FeatureFlags = {
  maintenanceMode: false,
  seasonsEnabled: true,
  tournamentsEnabled: true,
  ghostEventsEnabled: true,
  missionsEnabled: true,
  cosmeticsEnabled: true,
  notificationsEnabled: true,
  onboardingV1: true,
  guestMode: environment.guestModeDefault,
  droneHangar: true,
  aircraftComparison: true,
  testFlight: true,
  trainingAcademy: true,
  ghostRacing: true,
  leaderboards: true,
  adaptiveGraphics: true,
  analytics: environment.analyticsEnabled,
  errorReporting: environment.errorReportingEnabled,
  feedback: true,
  cloudSync: true,
  experimentalAircraft: false,
};

@Injectable({ providedIn: 'root' })
export class FeatureFlagService extends ApiClientService {
  private readonly cache = inject(CompetitiveCacheService);
  private readonly state = signal<FeatureFlags>(this.channelDefaults());
  readonly flags = this.state.asReadonly();
  readonly maintenanceMode = computed(() => this.state().maintenanceMode);
  readonly seasonsEnabled = computed(() => this.state().seasonsEnabled);
  readonly tournamentsEnabled = computed(() => this.state().tournamentsEnabled);
  readonly ghostEventsEnabled = computed(() => this.state().ghostEventsEnabled);
  readonly onboardingV1 = computed(() => this.state().onboardingV1);
  readonly guestMode = computed(() => this.state().guestMode);
  readonly feedbackEnabled = computed(() => this.state().feedback);
  readonly adaptiveGraphics = computed(() => this.state().adaptiveGraphics);
  readonly trainingAcademy = computed(() => this.state().trainingAcademy);

  isEnabled(flag: keyof FeatureFlags): boolean {
    return Boolean(this.state()[flag]);
  }

  load(): Observable<FeatureFlags> {
    const cached = this.cache.get<FeatureFlags>('features', true);
    if (cached) this.state.set({ ...this.channelDefaults(), ...cached.value });
    return this.http
      .get<FeatureFlags | { features?: Partial<FeatureFlags> }>(`${this.apiUrl}/features`)
      .pipe(
        map((response) => ({
          ...this.channelDefaults(),
          ...(('features' in response ? response.features : response) ?? {}),
        })),
        tap((flags) => {
          // Remote flags must never replace client physics definitions — only product gates.
          this.state.set(sanitizeRemoteFlags(flags));
          this.cache.set('features', flags, 5 * 60_000);
        }),
        catchError(() => of(this.state())),
      );
  }

  private channelDefaults(): FeatureFlags {
    const channel = environment.releaseChannel;
    return {
      ...DEFAULT_FLAGS,
      ...(CHANNEL_DEFAULTS[channel] ?? {}),
      guestMode: environment.guestModeDefault && DEFAULT_FLAGS.guestMode,
    };
  }
}

function sanitizeRemoteFlags(flags: FeatureFlags): FeatureFlags {
  return { ...flags };
}
