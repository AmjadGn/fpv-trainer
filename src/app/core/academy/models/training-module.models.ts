export type TrainingDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type TrainingEvaluatorType =
  | 'hover'
  | 'landing'
  | 'gateCourse'
  | 'figureEight'
  | 'crosswind';

export type TrainingMedal = 'none' | 'bronze' | 'silver' | 'gold';

export interface TrainingVec3 {
  x: number;
  y: number;
  z: number;
}

export interface TrainingQuat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface TrainingSpawnPose {
  position: TrainingVec3;
  orientation: TrainingQuat;
}

export interface TrainingMedalThresholds {
  bronze: number;
  silver: number;
  gold: number;
}

export interface TrainingUnlockRequirements {
  requireModuleIds?: string[];
  requireAnyModuleIds?: string[];
}

export interface TrainingInstructionStep {
  id: string;
  title: string;
  instruction: string;
  completionHint: string;
  illustrationType?: string;
  targetMarker?: string;
}

export interface TrainingModuleDefinition {
  id: string;
  version: number;
  title: string;
  description: string;
  objective: string;
  difficulty: TrainingDifficulty;
  estimatedDurationSeconds: number;
  environmentId: string;
  spawnPose: TrainingSpawnPose;
  allowedRateProfiles: string[];
  recommendedRateProfile: string;
  /** Optional aircraft recommendations for hangar / pre-flight UI. */
  allowedAircraftIds?: string[];
  recommendedAircraftIds?: string[];
  requiredAircraftClass?: string;
  forcedTrainingAircraftId?: string;
  evaluatorType: TrainingEvaluatorType;
  evaluatorConfig: Record<string, unknown>;
  successCriteria: string[];
  medalThresholds: TrainingMedalThresholds;
  unlockRequirements: TrainingUnlockRequirements;
  instructionalSteps: TrainingInstructionStep[];
  tips: string[];
  supportsGhost: boolean;
  enabled: boolean;
}

export interface TrainingResult {
  moduleId: string;
  moduleVersion: number;
  completed: boolean;
  score: number;
  medal: TrainingMedal;
  durationMs: number;
  penalties: number;
  metrics: Record<string, number>;
  completedAt: string;
}
