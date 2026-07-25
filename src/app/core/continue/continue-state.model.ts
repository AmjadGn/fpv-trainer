export type ContinueKind =
  | 'onboarding'
  | 'training'
  | 'free-flight'
  | 'test-flight'
  | 'race'
  | 'replay';

export interface ContinueState {
  version: number;
  kind: ContinueKind;
  label: string;
  aircraftId: string | null;
  environmentId: string | null;
  courseId: string | null;
  moduleId: string | null;
  weatherPresetId: string | null;
  updatedAt: string;
  dismissed: boolean;
}

export const CONTINUE_VERSION = 1;
export const CONTINUE_STORAGE_KEY = 'fpv-trainer.continue.v1';
