/**
 * Versioned persisted mission DTOs.
 * Pure data only — no Blob, DOM, Angular, or IndexedDB types.
 */

import { MISSION_PERSISTENCE_SCHEMA_VERSION } from '../constants';
import type { MissionBestImageStatus } from '../diagnostics';
import type { MissionScopeKey } from '../scope-key';

export type PersistedMissionStatus = 'completed' | 'failed';

export type PersistedObjectiveStatus =
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'incomplete';

export interface PersistedObjectiveImageAvailability {
  readonly acceptedImageAvailable: boolean;
  readonly captureId: string | null;
  readonly evidenceRef: string | null;
}

export interface PersistedMissionObjectiveRecord {
  readonly objectiveId: string;
  readonly objectiveVersion: string | null;
  readonly status: PersistedObjectiveStatus;
  readonly scorePoints: number;
  readonly maxPoints: number;
  readonly normalizedPhotographyScore: number | null;
  readonly attemptCount: number;
  readonly captureId: string | null;
  readonly evidenceRef: string | null;
  readonly feedbackCodes: readonly string[];
  readonly acceptedImageAvailable: boolean;
}

/**
 * Non-authoritative wall-clock metadata for history presentation only.
 * Must never affect Personal Best comparison.
 */
export interface PersistedResultSavedAtMetadata {
  readonly savedAtEpochMs: number;
  readonly savedAtIso: string;
}

export interface PersistedMissionResultRecord {
  readonly persistenceSchemaVersion: typeof MISSION_PERSISTENCE_SCHEMA_VERSION | string;
  readonly resultId: string;
  readonly missionScopeKey: MissionScopeKey | string;
  readonly missionId: string;
  readonly missionVersion: string;
  readonly scoringPolicyVersion: string;
  readonly evidenceSchemaVersion: string;
  readonly sessionId: string;
  readonly sessionGeneration: number;
  readonly locationId: string;
  readonly locationVersion: string;
  readonly aircraftId: string | null;
  readonly aircraftSourceType: string | null;
  readonly aircraftDefinitionVersion: string | null;
  readonly aircraftRuntimeCompatibilityVersion: string | null;
  readonly status: PersistedMissionStatus;
  readonly failureReasonCode: string | null;
  readonly totalScore: number;
  readonly maximumScore: number;
  readonly normalizedScore: number;
  readonly requiredObjectiveSubtotal: number;
  readonly timeBonusPoints: number;
  readonly elapsedTicks: number;
  readonly fixedStepSeconds: number;
  readonly objectives: readonly PersistedMissionObjectiveRecord[];
  readonly attemptCountTotal: number;
  readonly imageAvailability: readonly PersistedObjectiveImageAvailability[];
  readonly savedAt: PersistedResultSavedAtMetadata;
}

export interface PersistedPersonalBestReference {
  readonly resultId: string | null;
  readonly totalScore: number | null;
  readonly requiredObjectiveSubtotal: number | null;
  readonly elapsedTicks: number | null;
}

export interface PersistedMissionSummaryRecord {
  readonly persistenceSchemaVersion: typeof MISSION_PERSISTENCE_SCHEMA_VERSION | string;
  readonly missionScopeKey: MissionScopeKey | string;
  readonly missionId: string;
  readonly missionVersion: string;
  readonly scoringPolicyVersion: string;
  readonly latestResultId: string | null;
  readonly personalBestResultId: string | null;
  readonly completed: boolean;
  readonly completionCount: number;
  readonly totalAttemptCount: number;
  readonly latestScore: number | null;
  readonly bestScore: number | null;
  readonly lastPlayedAtEpochMs: number | null;
  readonly lastPlayedAtIso: string | null;
  readonly personalBestImageStatus: MissionBestImageStatus;
  readonly personalBest: PersistedPersonalBestReference;
}

/** Image manifest metadata without binary payload. */
export interface PersistedBestImageManifestEntry {
  readonly persistenceSchemaVersion: typeof MISSION_PERSISTENCE_SCHEMA_VERSION | string;
  readonly missionScopeKey: MissionScopeKey | string;
  readonly personalBestResultId: string;
  readonly objectiveId: string;
  readonly mimeType: string;
  readonly byteLength: number;
}

export function bestImageStoreKey(
  missionScopeKey: string,
  objectiveId: string,
): string {
  return `${missionScopeKey}:${objectiveId}`;
}
