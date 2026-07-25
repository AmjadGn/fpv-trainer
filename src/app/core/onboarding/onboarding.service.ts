import { Injectable, computed, signal } from '@angular/core';
import {
  BEGINNER_AIRCRAFT_IDS,
  DEFAULT_ONBOARDING_STATE,
  ONBOARDING_STEPS,
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_VERSION,
  recommendedAircraftForLevel,
  type ControlMethod,
  type ExperienceLevel,
  type OnboardingState,
  type OnboardingStepId,
} from './onboarding.models';

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly state = signal<OnboardingState>(this.read());

  readonly snapshot = this.state.asReadonly();
  readonly needsOnboarding = computed(() => {
    const s = this.state();
    return !s.completed && !s.skipped;
  });
  readonly currentStep = computed(() => this.state().currentStep);
  readonly experienceLevel = computed(() => this.state().experienceLevel);
  readonly controlMethod = computed(() => this.state().controlMethod);

  start(): void {
    this.patch({
      startedAt: this.state().startedAt ?? new Date().toISOString(),
      currentStep: 'welcome',
      skipped: false,
      completed: false,
    });
  }

  restart(): void {
    this.state.set({
      ...DEFAULT_ONBOARDING_STATE,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    this.persist();
  }

  skip(): void {
    this.patch({
      skipped: true,
      completed: false,
      completedAt: new Date().toISOString(),
    });
  }

  complete(): void {
    this.patch({
      completed: true,
      skipped: false,
      currentStep: 'finish',
      completedAt: new Date().toISOString(),
    });
  }

  setExperienceLevel(level: ExperienceLevel): void {
    this.patch({
      experienceLevel: level,
      selectedAircraftId: recommendedAircraftForLevel(level),
    });
  }

  setControlMethod(method: ControlMethod): void {
    this.patch({ controlMethod: method });
  }

  setAircraft(aircraftId: string): void {
    const allowed = (BEGINNER_AIRCRAFT_IDS as readonly string[]).includes(aircraftId)
      ? aircraftId
      : recommendedAircraftForLevel(this.state().experienceLevel);
    this.patch({ selectedAircraftId: allowed });
  }

  markGuidedFlightCompleted(): void {
    this.patch({ guidedFlightCompleted: true });
  }

  goToStep(step: OnboardingStepId): void {
    this.patch({ currentStep: step });
  }

  next(): void {
    const idx = ONBOARDING_STEPS.indexOf(this.state().currentStep);
    const next = ONBOARDING_STEPS[Math.min(idx + 1, ONBOARDING_STEPS.length - 1)];
    this.patch({ currentStep: next });
  }

  back(): void {
    const idx = ONBOARDING_STEPS.indexOf(this.state().currentStep);
    const prev = ONBOARDING_STEPS[Math.max(idx - 1, 0)];
    this.patch({ currentStep: prev });
  }

  private patch(partial: Partial<OnboardingState>): void {
    this.state.update((s) => ({
      ...s,
      ...partial,
      version: ONBOARDING_VERSION,
      updatedAt: new Date().toISOString(),
    }));
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(this.state()));
    } catch {
      /* ignore */
    }
  }

  private read(): OnboardingState {
    try {
      const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_ONBOARDING_STATE };
      const parsed = JSON.parse(raw) as Partial<OnboardingState>;
      return {
        ...DEFAULT_ONBOARDING_STATE,
        ...parsed,
        version: ONBOARDING_VERSION,
      };
    } catch {
      return { ...DEFAULT_ONBOARDING_STATE };
    }
  }
}
