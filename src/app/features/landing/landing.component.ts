import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AlphaAccessService } from '../../core/product/alpha-access.service';
import { FeatureFlagService } from '../../core/features/services/feature-flag.service';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { ProductAnalyticsService } from '../../core/analytics/product-analytics.service';
import { AnalyticsEvents } from '../../core/analytics/analytics-events';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent {
  private readonly router = inject(Router);
  private readonly onboarding = inject(OnboardingService);
  private readonly alpha = inject(AlphaAccessService);
  private readonly features = inject(FeatureFlagService);
  private readonly analytics = inject(ProductAnalyticsService);

  protected readonly guestAllowed = this.features.guestMode;
  protected readonly inviteCode = signal('');
  protected readonly alphaError = this.alpha.lastError;

  protected accessRequired(): boolean {
    return this.alpha.requiresCode();
  }

  protected onInviteInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.inviteCode.set(value);
  }

  protected startGuest(): void {
    if (this.alpha.requiresCode()) return;
    this.analytics.track(AnalyticsEvents.appOpened, { source: 'landing_guest' });
    if (this.onboarding.needsOnboarding() && this.features.onboardingV1()) {
      this.onboarding.start();
    }
    void this.router.navigateByUrl('/app');
  }

  protected startOnboarding(): void {
    if (this.alpha.requiresCode()) return;
    this.onboarding.start();
    this.analytics.track(AnalyticsEvents.onboardingStarted, { source: 'landing' });
    void this.router.navigateByUrl('/app');
  }

  protected submitCode(): void {
    if (this.alpha.submitInviteCode(this.inviteCode())) {
      this.startGuest();
    }
  }
}
