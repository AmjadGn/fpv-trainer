export type GuidanceTriggerType =
  | 'elapsed-time'
  | 'throttle-threshold'
  | 'altitude-reached'
  | 'yaw-movement'
  | 'pitch-movement'
  | 'roll-movement'
  | 'checkpoint-entered'
  | 'gate-passed'
  | 'landing-detected'
  | 'crash-detected'
  | 'controller-disconnected'
  | 'inactivity'
  | 'manual';

export interface GuidanceTrigger {
  type: GuidanceTriggerType;
  value?: number;
  id?: string;
}

export type GuidanceActionType =
  | 'show-text'
  | 'show-control-visualization'
  | 'highlight-hud'
  | 'show-directional-marker'
  | 'play-tone'
  | 'slow-simulation'
  | 'reset-aircraft'
  | 'advance-step'
  | 'offer-skip'
  | 'offer-retry';

export interface GuidanceAction {
  type: GuidanceActionType;
  text?: string;
  target?: string;
  durationMs?: number;
}

export interface GuidanceStep {
  id: string;
  title: string;
  body: string;
  trigger: GuidanceTrigger;
  actions: GuidanceAction[];
  optional?: boolean;
}

export interface GuidanceProgress {
  scriptId: string;
  stepIndex: number;
  completedStepIds: string[];
  startedAt: string;
  completedAt: string | null;
}

export interface GuidanceScript {
  id: string;
  version: number;
  title: string;
  /** Guidance must never run in competitive modes. */
  competitiveSafe: false;
  steps: GuidanceStep[];
}
