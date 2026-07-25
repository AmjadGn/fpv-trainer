import { Injectable, inject } from '@angular/core';
import { OnboardingService } from '../onboarding/onboarding.service';
import { TrainerSettingsService } from '../settings/services/trainer-settings.service';
import { SelectedAircraftService } from '../aircraft/services/selected-aircraft.service';
import { AnalyticsConsentService } from '../analytics/analytics-consent.service';

/**
 * Merges guest local preferences into an authenticated session.
 * Never deletes local guest preferences after login.
 */
@Injectable({ providedIn: 'root' })
export class GuestMigrationService {
  private readonly onboarding = inject(OnboardingService);
  private readonly settings = inject(TrainerSettingsService);
  private readonly aircraft = inject(SelectedAircraftService);
  private readonly consent = inject(AnalyticsConsentService);

  /**
   * Capture a snapshot of guest-local preferences for merge / upload.
   * Local storage remains the source of truth until cloud sync applies.
   */
  captureLocalSnapshot(): Record<string, unknown> {
    return {
      onboarding: this.onboarding.snapshot(),
      settingsVersion: this.settings.settings().version,
      selectedAircraftId: this.aircraft.selectedAircraftId(),
      analyticsConsent: this.consent.analytics(),
      errorReportingConsent: this.consent.errorReporting(),
      capturedAt: new Date().toISOString(),
    };
  }

  /**
   * Apply cloud preferences without overwriting newer local data.
   * Strategy: most recent preference wins for scalars; never wipe local aircraft selection.
   */
  mergeCloudPreferences(cloud: {
    selectedAircraftId?: string | null;
    updatedAt?: string;
  }): { applied: string[]; keptLocal: string[] } {
    const applied: string[] = [];
    const keptLocal: string[] = [];
    const localAircraft = this.aircraft.selectedAircraftId();
    if (cloud.selectedAircraftId && !localAircraft) {
      this.aircraft.select(cloud.selectedAircraftId);
      applied.push('selectedAircraftId');
    } else if (
      cloud.selectedAircraftId &&
      localAircraft &&
      cloud.selectedAircraftId !== localAircraft
    ) {
      keptLocal.push('selectedAircraftId');
    }
    return { applied, keptLocal };
  }
}
