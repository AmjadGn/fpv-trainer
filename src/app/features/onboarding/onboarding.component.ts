import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { AIRCRAFT_DISPLAY_NAMES } from '../../core/aircraft/models/aircraft-ids';
import { AnalyticsEvents } from '../../core/analytics/analytics-events';
import { ProductAnalyticsService } from '../../core/analytics/product-analytics.service';
import { SelectedAircraftService } from '../../core/aircraft/services/selected-aircraft.service';
import {
  BEGINNER_AIRCRAFT_IDS,
  type ControlMethod,
  type ExperienceLevel,
  type OnboardingStepId,
} from '../../core/onboarding/onboarding.models';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { AppShellService } from '../../core/shell/app-shell.service';
import { GamepadControllerService } from '../../core/controller/services/gamepad-controller.service';
import { ControllerCalibrationService } from '../../core/controller/services/controller-calibration.service';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [FpvButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.scss',
})
export class OnboardingComponent {
  private readonly onboarding = inject(OnboardingService);
  private readonly shell = inject(AppShellService);
  private readonly analytics = inject(ProductAnalyticsService);
  private readonly aircraft = inject(SelectedAircraftService);
  private readonly gamepad = inject(GamepadControllerService);
  private readonly calibration = inject(ControllerCalibrationService);

  protected readonly state = this.onboarding.snapshot;
  protected readonly step = this.onboarding.currentStep;
  protected readonly beginnerAircraft = BEGINNER_AIRCRAFT_IDS;
  protected readonly aircraftNames = AIRCRAFT_DISPLAY_NAMES;

  protected readonly stepIndex = computed(() => {
    const order: OnboardingStepId[] = [
      'welcome',
      'experience',
      'control-method',
      'controller-test',
      'calibration',
      'aircraft',
      'indicators',
      'guided-flight',
      'paths',
      'finish',
    ];
    return order.indexOf(this.step()) + 1;
  });

  protected readonly controllerConnected = computed(() => this.gamepad.connected());

  protected readonly controllerLabel = computed(() => {
    return this.gamepad.controllerName() || 'No controller detected';
  });

  protected skipAll(): void {
    this.onboarding.skip();
    this.analytics.track(AnalyticsEvents.onboardingSkipped, {
      step: this.step(),
    });
    this.shell.showHome();
  }

  protected next(): void {
    this.analytics.track(AnalyticsEvents.onboardingStepCompleted, {
      step: this.step(),
    });
    const current = this.step();
    if (current === 'control-method' && this.state().controlMethod === 'keyboard') {
      this.onboarding.goToStep('aircraft');
      return;
    }
    if (current === 'controller-test' && this.state().controlMethod === 'keyboard') {
      this.onboarding.goToStep('aircraft');
      return;
    }
    if (current === 'finish') {
      this.finish();
      return;
    }
    this.onboarding.next();
    this.analytics.track(AnalyticsEvents.onboardingStepViewed, {
      step: this.onboarding.currentStep(),
    });
  }

  protected back(): void {
    this.onboarding.back();
  }

  protected setExperience(level: ExperienceLevel): void {
    this.onboarding.setExperienceLevel(level);
    this.analytics.setExperienceLevel(level);
  }

  protected setControlMethod(method: ControlMethod): void {
    this.onboarding.setControlMethod(method);
    this.analytics.setControlMethod(method);
    this.analytics.track(AnalyticsEvents.controlMethodSelected, { method });
  }

  protected selectAircraft(id: string): void {
    this.onboarding.setAircraft(id);
    this.aircraft.select(id);
    this.analytics.track(AnalyticsEvents.aircraftSelected, {
      aircraftId: id,
      source: 'onboarding',
    });
  }

  protected openCalibration(): void {
    this.calibration.openWelcomeOrComplete();
    this.shell.showCalibration();
  }

  protected startGuidedFlight(): void {
    const id = this.state().selectedAircraftId ?? 'aeroguard-2';
    this.aircraft.select(id);
    this.onboarding.markGuidedFlightCompleted();
    this.analytics.track(AnalyticsEvents.lessonStarted, {
      moduleId: 'first-flight-v1',
    });
    this.shell.showFlight({ kind: 'training', moduleId: 'hover-control', aircraftId: id });
  }

  protected goLearn(): void {
    this.finish();
    this.shell.showLearn();
  }

  protected goFly(): void {
    this.finish();
    this.shell.showFly();
  }

  protected goCompete(): void {
    this.finish();
    // Compete is an online route; home Continue / Compete nav handles it.
    this.shell.showHome();
  }

  protected finish(): void {
    this.onboarding.complete();
    this.analytics.track(AnalyticsEvents.onboardingCompleted, {});
    this.analytics.track(AnalyticsEvents.dashboardEntered, { source: 'onboarding' });
    this.shell.showHome();
  }

  protected nameFor(id: string): string {
    return (this.aircraftNames as Record<string, string>)[id] ?? id;
  }
}
