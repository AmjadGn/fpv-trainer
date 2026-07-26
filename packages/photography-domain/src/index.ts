/**
 * `@fpv/photography-domain` — pure TypeScript photography-objective
 * scoring domain: camera projection math, objective/evidence contracts,
 * and deterministic scoring.
 *
 * Imports only from `@fpv/simulation-contracts`. No Angular, Three.js,
 * Rapier, IndexedDB, pixel/screenshot access, or controller-calibration
 * models — see each module's doc comment for the specific rule it upholds.
 *
 * This package does not import `@fpv/mission-domain` or
 * `@fpv/location-domain`; subject/zone references are opaque branded
 * strings (`ids.ts`). `@fpv/location-validation` is the package
 * responsible for joining photography objectives to actual missions and
 * locations.
 */

// ---- ids ----
export type { SubjectId, PhotographyObjectiveId, PositionZoneId, PhotoCaptureEvidenceId } from './ids';
export { asSubjectId, asPhotographyObjectiveId, asPositionZoneId, asPhotoCaptureEvidenceId } from './ids';

// ---- projection ----
export type { ProjectionResult, ProjectedPoint, ViewingSide, ViewingSideEvaluation, SpeedThresholdEvaluation } from './projection';
export {
  DEFAULT_IN_FRONT_EPSILON_METERS,
  SCREEN_CENTER,
  MAX_CENTERING_DISTANCE,
  invertUnitQuat,
  rotateVectorByQuat,
  worldPointToCameraLocal,
  isInFrontOfCamera,
  projectPerspectiveToNormalized,
  projectWorldPoint,
  projectSubjectSamplePoints,
  computeNormalizedScreenRectangle,
  frameIntersectionRatio,
  coverageRatio,
  centeringError,
  distance,
  viewingAngle,
  evaluateViewingSide,
  evaluateAltitudeRange,
  evaluateSpeedThresholds,
} from './projection';
/** Alias for `projectSubjectSamplePoints`, kept for API-naming symmetry with "bounds" language elsewhere. */
export { projectSubjectSamplePoints as projectSubjectBounds } from './projection';

// Re-exported for convenience: the projection model version this package's
// projection math is written against (see `@fpv/simulation-contracts/camera.ts`).
// `evidence.ts` uses this to reject evidence captured under an incompatible model.
export { PROJECTION_MODEL_VERSION } from '@fpv/simulation-contracts';

// ---- objective ----
export type {
  PhotographyObjectiveDefinition,
  CameraMode,
  NumericRange,
  FovConstraints,
  ScreenSpaceConstraints,
  CenteringTarget,
  BonusCondition,
  BonusConditionKind,
  AttemptPolicy,
} from './objective';
export { PHOTOGRAPHY_OBJECTIVE_SCHEMA_VERSION } from './objective';

// ---- evidence ----
export type {
  PhotoCaptureEvidence,
  PhotoCaptureEvidenceInput,
  PhotoCaptureEvidenceIdentity,
  AircraftEvidenceSnapshot,
  CameraEvidenceSnapshot,
  SpatialEvidenceContext,
  SubjectObservation,
  StabilityEvidence,
  EvidenceConstructionResult,
} from './evidence';
export { EVIDENCE_SCHEMA_VERSION, createPhotoCaptureEvidence, findForbiddenAircraftSnapshotKeys } from './evidence';

// ---- scoring policy ----
export type { PhotographyScoringPolicy, ScoringComponentId, ScoringComponentWeight } from './scoring-policy';
export { SCORING_POLICY_VERSION, SCORING_COMPONENT_ORDER, createDefaultPhotographyScoringPolicy } from './scoring-policy';

// ---- scoring ----
export type { PhotoEvaluationResult, PhotoScoreComponent } from './scoring';
export { evaluatePhotoCapture, quantize } from './scoring';

// ---- feedback codes ----
export type { FeedbackCode } from './feedback-codes';
export { FEEDBACK_CODES, isKnownFeedbackCode } from './feedback-codes';

// ---- objective validation ----
export { validatePhotographyObjective } from './validate-objective';
