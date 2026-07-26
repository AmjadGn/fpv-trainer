/**
 * `PhotographyObjectiveDefinition` — the authored, versioned description of
 * a single photography objective within a mission. Pure data only: no
 * functions, no closures, so instances remain JSON-serializable and
 * therefore trivially reproducible/deterministic across processes.
 *
 * This module intentionally does not import `@fpv/mission-domain` or
 * `@fpv/location-domain` — subject/zone references are opaque branded
 * strings (see `ids.ts`); `@fpv/location-validation` is responsible for
 * cross-checking that those ids actually exist in a given mission/location.
 */

import type { AltitudeRange, ElapsedTicks, NormalizedScreenPoint, NormalizedScreenRectangle } from '@fpv/simulation-contracts';
import type { PhotographyObjectiveId, PositionZoneId, SubjectId } from './ids';
import type { ViewingSide } from './projection';
import type { FeedbackCode } from './feedback-codes';

export const PHOTOGRAPHY_OBJECTIVE_SCHEMA_VERSION = '1.0.0';

/** Which live camera mode the objective requires (if any) while capturing. */
export type CameraMode = 'fpv' | 'chase' | 'orbit' | 'photo-mode';

/** An inclusive numeric range. Unit/meaning is documented per field that uses it. */
export interface NumericRange {
  readonly min: number;
  readonly max: number;
}

export interface FovConstraints {
  readonly minVerticalFovDeg?: number;
  readonly maxVerticalFovDeg?: number;
}

export interface ScreenSpaceConstraints {
  /** If set, the primary subject's screen anchor must fall within this rectangle (e.g. a rule-of-thirds zone). */
  readonly requiredAnchorRegion?: NormalizedScreenRectangle;
  /** Maximum allowed `1 - frameIntersectionRatio` (fraction of the subject that may be cropped by frame edges). */
  readonly maxFrameIntersectionLossRatio?: number;
}

export interface CenteringTarget {
  /** Usually `{ u: 0.5, v: 0.5 }` (see `SCREEN_CENTER` in `projection.ts`), but authorable per objective. */
  readonly targetAnchor: NormalizedScreenPoint;
  /** Maximum allowed Euclidean distance (normalized screen units) from `targetAnchor`. */
  readonly maxCenteringError: number;
}

export type BonusConditionKind =
  | 'coverage-above'
  | 'centering-below'
  | 'distance-within-tolerance-of-midpoint'
  | 'stability-duration-above'
  | 'composite-excellent-framing';

export interface BonusCondition {
  readonly id: string;
  readonly kind: BonusConditionKind;
  /** Meaning depends on `kind` — see `scoring.ts` `evaluateBonusCondition`. */
  readonly thresholdValue: number;
  /** Points added to the `bonus` component when this condition is satisfied. */
  readonly scoreBonus: number;
  readonly feedbackCode?: FeedbackCode;
}

export interface AttemptPolicy {
  /** `undefined` means unlimited attempts. */
  readonly maxAttempts?: number;
  readonly retryable: boolean;
  /** Minimum ticks between attempts, if any. */
  readonly cooldownTicks?: ElapsedTicks;
}

/**
 * A single authored photography objective. All fields are immutable plain
 * data — see module doc for the determinism/serializability rationale.
 */
export interface PhotographyObjectiveDefinition {
  readonly objectiveId: PhotographyObjectiveId;
  /** Exact `major.minor.patch` schema version of this definition (see `isExactVersion`). */
  readonly version: string;

  /** All subjects that must be observed for the objective to be satisfiable at all. */
  readonly requiredSubjectIds: readonly SubjectId[];
  /** How many of `requiredSubjectIds` must be simultaneously visible (must include all of `primarySubjectIds`). */
  readonly minRequiredSubjectCount: number;
  /** Subjects whose framing/centering/coverage/distance/viewing-angle/viewing-side are scored and gated. */
  readonly primarySubjectIds: readonly SubjectId[];
  /** Subjects that count toward visibility but are not individually scored for framing quality. */
  readonly secondarySubjectIds?: readonly SubjectId[];

  readonly requiredCameraMode?: CameraMode;
  readonly fovConstraints?: FovConstraints;

  /** Minimum per-subject `visibilityRatio` (0..1) to count a subject as "visible". */
  readonly visibilityMin: number;
  readonly screenSpaceConstraints?: ScreenSpaceConstraints;

  /** Allowed fraction of frame area (0..1) the primary subject(s) should occupy. */
  readonly coverageRange: NumericRange;
  readonly centeringTarget: CenteringTarget;

  /** Allowed camera-to-subject distance, in meters. */
  readonly cameraToSubjectDistanceRange: NumericRange;
  /** Optional distinct aircraft-body-to-subject distance constraint (camera may be offset from the body). */
  readonly aircraftToSubjectDistanceRange?: NumericRange;

  readonly viewingAngleRangeDeg: NumericRange;
  readonly allowedViewingSides: readonly ViewingSide[];

  readonly altitudeRange: AltitudeRange;
  readonly requiredAircraftPositionZoneId?: PositionZoneId;

  /** Minimum required line-of-sight ratio (0..1) from camera to primary subject(s). */
  readonly lineOfSightMin: number;
  /** Maximum allowed obstruction ratio (0..1) of the primary subject(s). */
  readonly obstructionMax: number;

  readonly maxLinearSpeedMps: number;
  readonly maxBodyAngularSpeedRadps: number;
  readonly stabilityDurationTicks: ElapsedTicks;

  readonly attemptPolicy: AttemptPolicy;
  readonly bonusConditions?: readonly BonusCondition[];
}
