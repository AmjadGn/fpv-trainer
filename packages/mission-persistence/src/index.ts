export {
  MISSION_PERSISTENCE_SCHEMA_VERSION,
  MISSION_RESULTS_RETENTION_LIMIT,
  MISSION_BEST_IMAGES_MAX_COUNT,
  MISSION_BEST_IMAGE_MAX_BYTES,
} from './constants';

export {
  asMissionScopeKey,
  buildMissionScopeKey,
  parseMissionScopeKey,
  isMissionScopeKey,
  type MissionScopeKey,
  type MissionScopeParts,
} from './scope-key';

export {
  MISSION_PERSISTENCE_DIAGNOSTICS,
  type MissionPersistenceDiagnostic,
  type MissionPersistenceDiagnosticCode,
  type MissionPersistenceStorageMode,
  type MissionBestImageStatus,
  type MissionResultSaveUiStatus,
} from './diagnostics';

export {
  bestImageStoreKey,
  type PersistedMissionStatus,
  type PersistedObjectiveStatus,
  type PersistedObjectiveImageAvailability,
  type PersistedMissionObjectiveRecord,
  type PersistedResultSavedAtMetadata,
  type PersistedMissionResultRecord,
  type PersistedPersonalBestReference,
  type PersistedMissionSummaryRecord,
  type PersistedBestImageManifestEntry,
} from './records/persisted-result';

export {
  comparePersonalBest,
  isBetterPersonalBest,
  personalBestEqual,
  toPersonalBestComparable,
  type PersonalBestComparable,
  type PersonalBestCompareOutcome,
} from './comparator';

export {
  planMissionResultRetention,
  sortResultsForHistory,
  type RetentionCandidate,
  type RetentionPlan,
  type RetentionPlanInput,
} from './retention';

export {
  validatePersistedMissionResult,
  validatePersistedMissionSummary,
  validatePersistedBestImageManifest,
  type ValidatedPersistenceResult,
} from './validation';

export {
  serializeMissionResult,
  deserializeMissionResult,
  serializeMissionSummary,
  deserializeMissionSummary,
  freezeMissionResult,
} from './serialization';

export {
  createEmptyMissionSummary,
  applyResultToSummary,
  withImageStatus,
  type ApplyResultToSummaryOutput,
} from './summary';

export type {
  MissionPersistencePort,
  MissionPersistenceOpenResult,
  MissionResultSaveOutcome,
  MissionBestImagePayload,
  MissionBestImageRecord,
  MissionBestImagesSaveOutcome,
  MissionPersistenceListResult,
  MissionPersistenceSummaryResult,
  MissionPersistencePersonalBestResult,
  MissionPersistenceImagesResult,
  MissionPersistenceClearResult,
} from './ports/mission-persistence.port';
