import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppShellService } from '../../core/shell/app-shell.service';
import { AuthSessionService } from '../../core/auth/services/auth-session.service';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { formatAppVersionLabel } from '../../core/product/app-version';
import { AdaptivePerformanceService } from '../../core/performance/adaptive-performance.service';
import { TrainerSettingsService } from '../../core/settings/services/trainer-settings.service';
import type { EnvironmentQuality } from '../../core/settings/models/trainer-settings.model';
import { FpvPageHeaderComponent } from '../../shared/ui/fpv-page-header.component';
import { FpvPanelComponent } from '../../shared/ui/fpv-panel.component';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';
import { FpvIconComponent } from '../../shared/ui/fpv-icon.component';

@Component({
  selector: 'app-settings-hub',
  standalone: true,
  imports: [FpvPageHeaderComponent, FpvPanelComponent, FpvButtonDirective, FpvIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fpv-page-bg">
      <main class="fpv-page settings">
        <fpv-page-header
          eyebrow="Preferences"
          title="Settings"
          support="Controls, flight, graphics, accessibility, privacy, and advanced diagnostics."
        />

        <div class="settings__grid">
          @for (section of sections; track section.id) {
            <fpv-panel [title]="section.title" [subtitle]="section.body">
              <button type="button" fpvButton variant="secondary" size="sm" (click)="open(section.id)">
                <fpv-icon [name]="section.icon" [size]="16" />
                Open
              </button>
            </fpv-panel>
          }
        </div>

        <fpv-panel title="Graphics quality" subtitle="Does not change flight physics.">
          <div class="settings__quality">
            @for (q of qualities; track q) {
              <button type="button" fpvButton variant="secondary" size="sm" (click)="setQuality(q)">
                {{ q }}
              </button>
            }
            <button type="button" fpvButton variant="ghost" size="sm" (click)="toggleAdaptive()">
              Adaptive: {{ adaptive.enabled() ? 'On' : 'Off' }}
            </button>
          </div>
        </fpv-panel>

        <fpv-panel title="Onboarding" subtitle="Replay the first-run guide.">
          <button type="button" fpvButton variant="secondary" size="sm" (click)="restartOnboarding()">
            Restart onboarding
          </button>
        </fpv-panel>

        <fpv-panel title="Danger zone" subtitle="Destructive actions are confirmed before they run.">
          <div class="settings__danger">
            <button type="button" fpvButton variant="danger" size="sm" (click)="openAccount()">
              Account & data
            </button>
            <button type="button" fpvButton variant="ghost" size="sm" (click)="openPrivacy()">
              Privacy center
            </button>
          </div>
        </fpv-panel>

        <p class="settings__version">{{ versionLabel }}</p>
      </main>
    </div>
  `,
  styles: [
    `
      .settings__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: var(--fpv-space-16);
        margin-bottom: var(--fpv-space-24);
      }
      .settings__danger,
      .settings__quality {
        display: flex;
        flex-wrap: wrap;
        gap: var(--fpv-space-8);
      }
      .settings__version {
        margin-top: 1.5rem;
        opacity: 0.7;
        font-size: 0.85rem;
      }
    `,
  ],
})
export class SettingsHubComponent {
  private readonly shell = inject(AppShellService);
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly onboarding = inject(OnboardingService);
  private readonly settings = inject(TrainerSettingsService);
  protected readonly adaptive = inject(AdaptivePerformanceService);
  protected readonly versionLabel = formatAppVersionLabel();
  protected readonly qualities: EnvironmentQuality[] = ['low', 'medium', 'high'];

  protected readonly sections = [
    { id: 'controls', title: 'Controls', body: 'Gamepad mapping and input feel.', icon: 'controller' as const },
    { id: 'calibration', title: 'Calibration', body: 'Stick centers, ranges, and deadzones.', icon: 'controller' as const },
    { id: 'flight', title: 'Flight', body: 'Assistance and reset behavior (in-flight panel).', icon: 'fly' as const },
    { id: 'camera', title: 'Camera', body: 'FPV vs chase and look sensitivity.', icon: 'camera' as const },
    { id: 'audio', title: 'Audio', body: 'Engine, cues, and UI sounds.', icon: 'audio' as const },
    { id: 'graphics', title: 'Graphics', body: 'Quality presets and environment detail.', icon: 'weather' as const },
    { id: 'accessibility', title: 'Accessibility', body: 'Motion reduction and assistive options.', icon: 'info' as const },
    { id: 'privacy', title: 'Privacy', body: 'Analytics, error reporting, local data.', icon: 'profile' as const },
    { id: 'advanced', title: 'Advanced', body: 'Diagnostics and version information.', icon: 'settings' as const },
    { id: 'feedback', title: 'Feedback', body: 'Report bugs and suggestions.', icon: 'info' as const },
  ];

  protected open(id: string): void {
    if (id === 'calibration' || id === 'controls') {
      this.shell.showCalibration();
      return;
    }
    if (id === 'privacy') {
      this.shell.showPrivacy();
      return;
    }
    if (id === 'advanced') {
      this.shell.showDiagnostics();
      return;
    }
    if (id === 'feedback') {
      this.shell.showFeedback();
      return;
    }
    if (id === 'accessibility') {
      this.shell.showPrivacy();
      return;
    }
    // Flight-adjacent settings remain available from the in-flight panel.
    this.shell.showFlight({ kind: 'free' });
  }

  protected setQuality(quality: EnvironmentQuality): void {
    this.settings.setQuality(quality);
    this.adaptive.markUserOverride();
  }

  protected toggleAdaptive(): void {
    this.adaptive.setEnabled(!this.adaptive.enabled());
  }

  protected restartOnboarding(): void {
    this.onboarding.restart();
    this.shell.showOnboarding();
  }

  protected openAccount(): void {
    void this.router.navigateByUrl(this.auth.isAuthenticated() ? '/account' : '/login');
  }

  protected openPrivacy(): void {
    this.shell.showPrivacy();
  }
}
