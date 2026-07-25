import type {
  TrainingMedal,
  TrainingModuleDefinition,
} from './training-module.models';

export type TrainingSessionState =
  | 'idle'
  | 'briefing'
  | 'preparing'
  | 'countdown'
  | 'active'
  | 'paused'
  | 'success'
  | 'failed'
  | 'results';

/** Read-only flight snapshot consumed by pure evaluators. */
export interface TrainingSessionSnapshot {
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
  velocity: { x: number; y: number; z: number };
  speed: number;
  altitude: number;
  armed: boolean;
  crashed: boolean;
  throttle: number;
  elapsedMs: number;
  deltaSeconds: number;
}

export interface TrainingPenalty {
  id: string;
  label: string;
  amount: number;
}

export interface TrainingEvaluation {
  completed: boolean;
  /** Score clamped to 0–100. */
  score: number;
  medal: TrainingMedal;
  metrics: Record<string, number>;
  penalties: TrainingPenalty[];
  message?: string;
}

export interface TrainingEvaluatorEvent {
  type: string;
  payload?: unknown;
}

export interface TrainingEvaluatorStartContext {
  module: TrainingModuleDefinition;
}

/**
 * Pure strategy interface for module scoring.
 * Implementations must not touch Angular DI, physics, or rendering.
 */
export interface TrainingEvaluator {
  start(context: TrainingEvaluatorStartContext): void;
  update(snapshot: TrainingSessionSnapshot): void;
  handleEvent(event: TrainingEvaluatorEvent): void;
  finish(): TrainingEvaluation;
  reset(): void;
}
