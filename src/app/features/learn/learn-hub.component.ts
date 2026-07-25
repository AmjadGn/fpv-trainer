import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppShellService } from '../../core/shell/app-shell.service';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { FeatureFlagService } from '../../core/features/services/feature-flag.service';
import { FpvPageHeaderComponent } from '../../shared/ui/fpv-page-header.component';
import { FpvPanelComponent } from '../../shared/ui/fpv-panel.component';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';

@Component({
  selector: 'app-learn-hub',
  standalone: true,
  imports: [FpvPageHeaderComponent, FpvPanelComponent, FpvButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fpv-page-bg">
      <main class="fpv-page">
        <fpv-page-header
          eyebrow="Learn"
          title="Training & control basics"
          support="Build stick skills before Free Flight or racing. Assistance is optional and always labeled."
        />

        <div class="hub-grid">
          <fpv-panel title="First Flight" subtitle="Short guided lesson — hover, yaw, roll, pitch, one gate.">
            <button type="button" fpvButton variant="primary" size="sm" (click)="firstFlight()">
              Start
            </button>
          </fpv-panel>
          <fpv-panel title="Training Academy" subtitle="Hover, landing, gates, figure-eight, wind basics.">
            <button type="button" fpvButton variant="secondary" size="sm" (click)="academy()">
              Open Academy
            </button>
          </fpv-panel>
          <fpv-panel title="Controller setup" subtitle="Test connection, calibrate sticks, save a profile.">
            <button type="button" fpvButton variant="secondary" size="sm" (click)="calibration()">
              Calibrate
            </button>
          </fpv-panel>
          <fpv-panel title="Restart onboarding" subtitle="Replay the first-run guide anytime.">
            <button type="button" fpvButton variant="ghost" size="sm" (click)="restartOnboarding()">
              Restart
            </button>
          </fpv-panel>
        </div>
      </main>
    </div>
  `,
  styles: [
    `
      .hub-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: var(--fpv-space-16);
      }
    `,
  ],
})
export class LearnHubComponent {
  private readonly shell = inject(AppShellService);
  private readonly onboarding = inject(OnboardingService);
  private readonly features = inject(FeatureFlagService);

  protected firstFlight(): void {
    this.shell.showFlight({ kind: 'training', moduleId: 'hover-control', aircraftId: 'aeroguard-2' });
  }

  protected academy(): void {
    if (this.features.trainingAcademy()) {
      this.shell.showAcademy();
    }
  }

  protected calibration(): void {
    this.shell.showCalibration();
  }

  protected restartOnboarding(): void {
    this.onboarding.restart();
    this.shell.showOnboarding();
  }
}
