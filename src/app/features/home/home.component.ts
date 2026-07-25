import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';

import { TrainingProgressService } from '../../core/academy/services/training-progress.service';
import { AIRCRAFT_DISPLAY_NAMES } from '../../core/aircraft/models/aircraft-ids';
import { SelectedAircraftService } from '../../core/aircraft/services/selected-aircraft.service';
import { AnalyticsEvents } from '../../core/analytics/analytics-events';
import { ProductAnalyticsService } from '../../core/analytics/product-analytics.service';
import { ContinueExperienceService } from '../../core/continue/continue-experience.service';
import { GamepadControllerService } from '../../core/controller/services/gamepad-controller.service';
import { FeatureFlagService } from '../../core/features/services/feature-flag.service';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { ProgressionService } from '../../core/progression/services/progression.service';
import { ReplayRecorderService } from '../../core/replay/services/replay-recorder.service';
import { TrainerSettingsService } from '../../core/settings/services/trainer-settings.service';
import { AppShellService } from '../../core/shell/app-shell.service';
import { AdaptivePerformanceService } from '../../core/performance/adaptive-performance.service';
import { AuthSessionService } from '../../core/auth/services/auth-session.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  private readonly shell = inject(AppShellService);
  private readonly progression = inject(ProgressionService);
  private readonly trainingProgress = inject(TrainingProgressService);
  private readonly replayRecorder = inject(ReplayRecorderService);
  private readonly settings = inject(TrainerSettingsService);
  private readonly selectedAircraft = inject(SelectedAircraftService);
  private readonly router = inject(Router);
  private readonly onboarding = inject(OnboardingService);
  private readonly continueXp = inject(ContinueExperienceService);
  private readonly gamepad = inject(GamepadControllerService);
  private readonly analytics = inject(ProductAnalyticsService);
  private readonly features = inject(FeatureFlagService);
  private readonly adaptive = inject(AdaptivePerformanceService);
  private readonly auth = inject(AuthSessionService);

  protected readonly levelInfo = this.progression.levelInfo;
  protected readonly progress = this.progression.progress;
  protected readonly hasReplay = this.replayRecorder.hasReplay;
  protected readonly continuePrompt = this.continueXp.prompt;
  protected readonly needsOnboarding = this.onboarding.needsOnboarding;
  protected readonly isGuest = computed(() => !this.auth.isAuthenticated());

  protected readonly academyCompleted = computed(() => {
    const modules = this.trainingProgress.store().modules;
    return Object.values(modules).filter((m) => m.completed).length;
  });

  protected readonly aircraftLabel = computed(() => {
    const id = this.selectedAircraft.selectedAircraftId();
    return (AIRCRAFT_DISPLAY_NAMES as Record<string, string>)[id] ?? id;
  });

  protected readonly controllerStatus = computed(() => {
    if (this.gamepad.connected()) {
      return this.gamepad.controllerName() ?? 'Connected';
    }
    return 'Keyboard ready';
  });

  ngOnInit(): void {
    this.analytics.track(AnalyticsEvents.dashboardEntered, {
      guest: this.isGuest(),
    });
    this.adaptive.applyInitialRecommendation(false);
    if (this.needsOnboarding() && this.features.onboardingV1()) {
      this.shell.showOnboarding();
    }
  }

  protected environmentLabel(): string {
    const id = this.settings.environmentSettings().selectedEnvironmentId;
    return id
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  protected onLearn(): void {
    this.shell.showLearn();
  }

  protected onFly(): void {
    this.shell.showFly();
  }

  protected onCompete(): void {
    void this.router.navigateByUrl('/compete');
  }

  protected onContinue(): void {
    const prompt = this.continuePrompt();
    if (!prompt) return;
    this.analytics.track(AnalyticsEvents.continueAccepted, { kind: prompt.kind });
    if (prompt.kind === 'onboarding') {
      this.shell.showOnboarding();
      return;
    }
    if (prompt.kind === 'training') {
      this.shell.showAcademy();
      return;
    }
    if (prompt.kind === 'replay') {
      this.shell.showFlight({ kind: 'replay' });
      return;
    }
    if (prompt.kind === 'test-flight' && prompt.aircraftId) {
      this.shell.showFlight({ kind: 'test-flight', aircraftId: prompt.aircraftId });
      return;
    }
    this.shell.showFlight({ kind: 'free', aircraftId: prompt.aircraftId ?? undefined });
  }

  protected onChangeSetup(): void {
    this.shell.showFly();
  }

  protected dismissContinue(): void {
    this.continueXp.dismiss();
  }

  protected onHangar(): void {
    this.shell.showHangar();
  }

  protected onCalibration(): void {
    this.shell.showCalibration();
  }

  protected onSettings(): void {
    this.shell.showSettings();
  }

  protected onFeedback(): void {
    this.shell.showFeedback();
  }

  protected onOnboarding(): void {
    this.onboarding.restart();
    this.shell.showOnboarding();
  }

  protected onLatestReplay(): void {
    if (!this.hasReplay()) return;
    this.shell.showFlight({ kind: 'replay' });
  }
}
