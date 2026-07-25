import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AnalyticsConsentService } from '../../core/analytics/analytics-consent.service';
import { clearLocalProductData } from '../../core/local-data/local-store';
import { formatAppVersionLabel } from '../../core/product/app-version';
import { AuthSessionService } from '../../core/auth/services/auth-session.service';
import { Router } from '@angular/router';
import { AppShellService } from '../../core/shell/app-shell.service';
import { FpvPageHeaderComponent } from '../../shared/ui/fpv-page-header.component';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';
import { FpvPanelComponent } from '../../shared/ui/fpv-panel.component';

@Component({
  selector: 'app-privacy-center',
  standalone: true,
  imports: [FpvPageHeaderComponent, FpvButtonDirective, FpvPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fpv-page-bg">
      <main class="fpv-page">
        <fpv-page-header
          eyebrow="Privacy"
          title="Privacy & data"
          support="Essential storage is required for settings and calibration. Analytics is optional and never required to fly."
        />

        <fpv-panel title="Optional data" subtitle="Change these anytime.">
          <div class="privacy__row">
            <span>Analytics</span>
            <select [value]="consent.analytics()" (change)="setAnalytics($event)">
              <option value="unknown">Ask later</option>
              <option value="granted">Allowed</option>
              <option value="denied">Denied</option>
            </select>
          </div>
          <div class="privacy__row">
            <span>Error reporting</span>
            <select [value]="consent.errorReporting()" (change)="setErrors($event)">
              <option value="unknown">Default (on for alpha)</option>
              <option value="granted">Allowed</option>
              <option value="denied">Denied</option>
            </select>
          </div>
          <div class="privacy__row">
            <span>Personalization</span>
            <select [value]="consent.personalization()" (change)="setPersonalization($event)">
              <option value="unknown">Ask later</option>
              <option value="granted">Allowed</option>
              <option value="denied">Denied</option>
            </select>
          </div>
        </fpv-panel>

        <fpv-panel title="Local data" subtitle="Clears data on this device only.">
          <div class="privacy__actions">
            <button type="button" fpvButton variant="secondary" size="sm" (click)="clearLocal()">
              Clear local product data
            </button>
            <button type="button" fpvButton variant="ghost" size="sm" (click)="openPolicy()">
              Privacy policy
            </button>
            @if (auth.isAuthenticated()) {
              <button type="button" fpvButton variant="ghost" size="sm" (click)="openAccount()">
                Account export / deletion
              </button>
            }
          </div>
          @if (clearedMessage) {
            <p role="status">{{ clearedMessage }}</p>
          }
        </fpv-panel>

        <p class="privacy__version">{{ versionLabel }}</p>
        <button type="button" fpvButton variant="ghost" (click)="back()">Back</button>
      </main>
    </div>
  `,
  styles: [
    `
      .privacy__row {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: center;
        margin-bottom: 0.75rem;
      }
      .privacy__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .privacy__version {
        margin-top: 1.5rem;
        opacity: 0.7;
        font-size: 0.85rem;
      }
    `,
  ],
})
export class PrivacyCenterComponent {
  protected readonly consent = inject(AnalyticsConsentService);
  protected readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly shell = inject(AppShellService);
  protected readonly versionLabel = formatAppVersionLabel();
  protected clearedMessage = '';

  protected setAnalytics(event: Event): void {
    this.consent.setAnalytics((event.target as HTMLSelectElement).value as 'unknown' | 'granted' | 'denied');
  }

  protected setErrors(event: Event): void {
    this.consent.setErrorReporting(
      (event.target as HTMLSelectElement).value as 'unknown' | 'granted' | 'denied',
    );
  }

  protected setPersonalization(event: Event): void {
    this.consent.setPersonalization(
      (event.target as HTMLSelectElement).value as 'unknown' | 'granted' | 'denied',
    );
  }

  protected async clearLocal(): Promise<void> {
    const cleared = await clearLocalProductData();
    this.clearedMessage = `Cleared ${cleared.length} local keys. Reload recommended.`;
  }

  protected openPolicy(): void {
    void this.router.navigateByUrl('/privacy');
  }

  protected openAccount(): void {
    void this.router.navigateByUrl('/account');
  }

  protected back(): void {
    this.shell.showSettings();
  }
}
