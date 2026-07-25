import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppShellService } from '../../core/shell/app-shell.service';
import { SelectedAircraftService } from '../../core/aircraft/services/selected-aircraft.service';
import { AIRCRAFT_DISPLAY_NAMES } from '../../core/aircraft/models/aircraft-ids';
import { TrainerSettingsService } from '../../core/settings/services/trainer-settings.service';
import { ReplayRecorderService } from '../../core/replay/services/replay-recorder.service';
import { ContinueExperienceService } from '../../core/continue/continue-experience.service';
import { FpvPageHeaderComponent } from '../../shared/ui/fpv-page-header.component';
import { FpvPanelComponent } from '../../shared/ui/fpv-panel.component';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';

@Component({
  selector: 'app-fly-hub',
  standalone: true,
  imports: [FpvPageHeaderComponent, FpvPanelComponent, FpvButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fpv-page-bg">
      <main class="fpv-page">
        <fpv-page-header
          eyebrow="Fly"
          title="Open flying"
          support="Non-competitive sessions: Free Flight, Test Flight, Hangar, environments, and local replays."
        />

        <p class="fly-meta">
          Aircraft: <strong>{{ aircraftLabel() }}</strong>
          · Environment: <strong>{{ environmentLabel() }}</strong>
        </p>

        <div class="hub-grid">
          <fpv-panel title="Free Flight" subtitle="Immediate stick time with your current setup.">
            <button type="button" fpvButton variant="primary" size="sm" (click)="freeFlight()">
              Start Free Flight
            </button>
          </fpv-panel>
          <fpv-panel title="Hangar" subtitle="Choose aircraft, compare, and launch Test Flight.">
            <button type="button" fpvButton variant="secondary" size="sm" (click)="hangar()">
              Open Hangar
            </button>
          </fpv-panel>
          <fpv-panel title="Environments & weather" subtitle="Pick a world and flight conditions.">
            <button type="button" fpvButton variant="secondary" size="sm" (click)="environments()">
              Environments
            </button>
          </fpv-panel>
          <fpv-panel title="Local races" subtitle="Practice courses without ranked submission.">
            <button type="button" fpvButton variant="secondary" size="sm" (click)="courses()">
              Courses
            </button>
          </fpv-panel>
          <fpv-panel title="Challenges" subtitle="Daily and weather challenges.">
            <button type="button" fpvButton variant="secondary" size="sm" (click)="challenges()">
              Challenges
            </button>
          </fpv-panel>
          <fpv-panel title="Latest replay" subtitle="Watch your most recent recorded flight.">
            <button
              type="button"
              fpvButton
              variant="ghost"
              size="sm"
              (click)="replay()"
              [disabled]="!hasReplay()"
            >
              Play replay
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
      .fly-meta {
        margin: 0 0 1rem;
        color: var(--fpv-text-muted, #9aa49c);
      }
    `,
  ],
})
export class FlyHubComponent {
  private readonly shell = inject(AppShellService);
  private readonly aircraft = inject(SelectedAircraftService);
  private readonly settings = inject(TrainerSettingsService);
  private readonly replayRecorder = inject(ReplayRecorderService);
  private readonly continueXp = inject(ContinueExperienceService);

  protected readonly hasReplay = this.replayRecorder.hasReplay;

  protected aircraftLabel(): string {
    const id = this.aircraft.selectedAircraftId();
    return (AIRCRAFT_DISPLAY_NAMES as Record<string, string>)[id] ?? id;
  }

  protected environmentLabel(): string {
    const id = this.settings.environmentSettings().selectedEnvironmentId;
    return id
      .split('-')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  }

  protected freeFlight(): void {
    this.continueXp.remember({
      kind: 'free-flight',
      label: `Free Flight with ${this.aircraftLabel()} in ${this.environmentLabel()}`,
      aircraftId: this.aircraft.selectedAircraftId(),
      environmentId: this.settings.environmentSettings().selectedEnvironmentId,
    });
    this.shell.showFlight({ kind: 'free' });
  }

  protected hangar(): void {
    this.shell.showHangar();
  }

  protected environments(): void {
    this.shell.showEnvironments();
  }

  protected courses(): void {
    this.shell.showCourses();
  }

  protected challenges(): void {
    this.shell.showChallenges();
  }

  protected replay(): void {
    this.shell.showFlight({ kind: 'replay' });
  }
}
