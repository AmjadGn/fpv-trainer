export type ExperienceLevel = 'first-time' | 'some-experience' | 'experienced-fpv';
export type ControlMethod = 'gamepad' | 'keyboard' | 'touch' | 'demo';

export type OnboardingStepId =
  | 'welcome'
  | 'experience'
  | 'control-method'
  | 'controller-test'
  | 'calibration'
  | 'aircraft'
  | 'indicators'
  | 'guided-flight'
  | 'paths'
  | 'finish';

export interface OnboardingState {
  version: number;
  completed: boolean;
  skipped: boolean;
  currentStep: OnboardingStepId;
  experienceLevel: ExperienceLevel | null;
  controlMethod: ControlMethod | null;
  selectedAircraftId: string | null;
  guidedFlightCompleted: boolean;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export const ONBOARDING_VERSION = 1;
export const ONBOARDING_STORAGE_KEY = 'fpv-trainer.onboarding.v1';

export const ONBOARDING_STEPS: readonly OnboardingStepId[] = [
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
] as const;

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  version: ONBOARDING_VERSION,
  completed: false,
  skipped: false,
  currentStep: 'welcome',
  experienceLevel: null,
  controlMethod: null,
  selectedAircraftId: null,
  guidedFlightCompleted: false,
  startedAt: null,
  completedAt: null,
  updatedAt: new Date(0).toISOString(),
};

export const BEGINNER_AIRCRAFT_IDS = ['aeroguard-2', 'nano-scout'] as const;

export function recommendedAircraftForLevel(level: ExperienceLevel | null): string {
  if (level === 'experienced-fpv') return 'nano-scout';
  return 'aeroguard-2';
}
