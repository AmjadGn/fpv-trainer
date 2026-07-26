/**
 * `@fpv/mission-domain` — pure TypeScript mission content, session, and
 * scoring contracts.
 *
 * Imports ONLY from `@fpv/simulation-contracts`. Deliberately does NOT
 * import `@fpv/photography-domain` (photography objectives are referenced
 * by opaque `photographyObjectiveId` string only, to avoid a circular
 * dependency) or any Angular/Three.js/Rapier/IndexedDB/controller-
 * calibration code.
 *
 * Mission aircraft snapshots (`MissionAircraftCapabilities`) are
 * already-normalized authoritative state: no raw controller axes,
 * calibration version, inversion flags, or device identity ever appear in
 * this package's types. Endurance is informational-only and can never
 * become a hard blocking constraint — see aircraft-compatibility.ts.
 */

export type {
  MissionId,
  MissionVersion,
  MissionSchemaVersion,
  MissionCompatibilityVersion,
  MissionSessionId,
  ObjectiveId,
  MissionResultId,
} from './ids';
export {
  asMissionId,
  asMissionVersion,
  asMissionSchemaVersion,
  asMissionCompatibilityVersion,
  asMissionSessionId,
  asObjectiveId,
  asMissionResultId,
} from './ids';

export type {
  CapabilityProvenance,
  CameraProfileCapability,
  MissionAircraftCapabilities,
} from './aircraft-capabilities';

export type {
  CompatibilityIssue,
  CompatibilityIssueCode,
  CompatibilityIssueSeverity,
  EvaluateAircraftCompatibilityOptions,
  FovRangeDeg,
  MissionAircraftCompatibilityPolicy,
  MissionAircraftCompatibilityResult,
  MissionAircraftCompatibilityStatus,
} from './aircraft-compatibility';
export {
  assertNoUnsupportedAircraftConstraints,
  evaluateMissionAircraftCompatibility,
} from './aircraft-compatibility';

export type {
  ObjectiveDefinition,
  ObjectiveGrouping,
  ObjectiveKind,
  PhotographyObjectiveDefinition,
  ReachZoneObjectiveDefinition,
  ReturnToZoneObjectiveDefinition,
} from './objectives';
export {
  findObjectiveById,
  isPhotographyObjective,
  isReachZoneObjective,
  isReturnToZoneObjective,
} from './objectives';

export type {
  CompletionPolicy,
  CrashFailureRule,
  FailurePolicy,
  FailureReasonCode,
  InfrastructureFailureRule,
  OutOfBoundsFailureRule,
  ProhibitedZoneFailureRule,
  ScoreAggregationPolicy,
  TimeBonusPolicy,
  TimeoutFailureRule,
  TimePolicy,
} from './policies';

export type {
  AllocateObjectiveMaxPointsInput,
  AllocateObjectiveMaxPointsResult,
  ObjectiveScoreAllocationPolicy,
  ObjectiveScoreWeight,
} from './score-allocation';
export {
  OBJECTIVE_SCORE_ALLOCATION_VERSION,
  allocateRequiredObjectiveMaxPoints,
  scorePointsFromNormalized,
} from './score-allocation';

export type {
  CreateMissionDefinitionInput,
  LocationVersionRange,
  MissionBriefing,
  MissionDefinition,
  MissionMetadata,
  MissionResultsMetadata,
  MissionVersions,
} from './mission-definition';
export { createMissionDefinition, MISSION_SCHEMA_VERSION } from './mission-definition';

export type {
  AggregateMissionResultInput,
  AggregateMissionResultOutput,
  CreateMissionResultRecordInput,
  MissionResultRecord,
  MissionScore,
  MissionStatus,
  ObjectiveResult,
  ObjectiveResultStatus,
} from './results';
export { aggregateMissionResult, createMissionResultRecord } from './results';

export type { ObjectiveProgress, ObjectiveProgressStatus, MissionSessionState } from './session';
export { createMissionSession } from './session';

export type {
  IllegalMissionTransition,
  LegalMissionTransition,
  MissionRetryScope,
  MissionState,
  MissionStateEvent,
  MissionStateEventType,
  MissionTransitionResult,
} from './state-machine';
export {
  isLegalMissionTransition,
  MISSION_STATE_EVENT_TYPES,
  MISSION_STATES,
  transitionMissionState,
} from './state-machine';

export { applyObjectiveResult } from './apply-objective';

export type { MissionCompatibilityCheckResult, MissionCompatibilityContext } from './compatibility';
export { checkMissionCompatibility } from './compatibility';
