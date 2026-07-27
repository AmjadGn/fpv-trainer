/**
 * `PhotoCaptureEvidence` — an immutable, schema-versioned record of a single
 * photo-capture attempt, built by the application layer from
 * post-collision-correction aircraft state and a canonical (cosmetics-free)
 * camera snapshot.
 *
 * Schema 2.0.0 (Checkpoint 5 review correction): identity carries durable
 * mission / location / session / generation context so Checkpoint 6
 * persistence does not need to infer context from mutable runtime state.
 *
 * Deliberately excludes controller/stick/gamepad/calibration fields on
 * `aircraftSnapshot` — see `docs/architecture` dependency rules ("mission
 * and photography must not import controller-calibration models"). Both
 * the TypeScript shape and a defensive runtime key scan enforce this.
 */

import {
  isFiniteCameraProjection,
  isFiniteNumber,
  isFinitePose,
  isFiniteVec3,
  isCompatibleMajor,
  PROJECTION_MODEL_VERSION,
  type CameraProjection,
  type ElapsedTicks,
  type NormalizedScreenPoint,
  type NormalizedScreenRectangle,
  type Pose,
  type SimulationTick,
  type Vec3,
} from '@fpv/simulation-contracts';
import type { PhotoCaptureEvidenceId, PhotographyObjectiveId, PositionZoneId, SubjectId } from './ids';
import type { CameraMode } from './objective';
import type { ViewingSide } from './projection';

/** Evidence schema major bump: previously optional context is now required. */
export const EVIDENCE_SCHEMA_VERSION = '2.0.0';

/**
 * Key substrings that must never appear on `AircraftEvidenceSnapshot` (case
 * insensitive). Defense in depth against a caller bypassing the TypeScript
 * shape with `as any` / data loaded from an untrusted source.
 */
const FORBIDDEN_AIRCRAFT_SNAPSHOT_KEY_TERMS = [
  'controller',
  'stick',
  'gamepad',
  'joystick',
  'calibration',
  'invert',
  'deadzone',
  'trim',
  'throttleinput',
  'aileroninput',
  'elevatorinput',
  'rudderinput',
];

/**
 * Durable capture identity. Opaque string IDs keep this package free of
 * mission-domain / location-domain imports.
 */
export interface PhotoCaptureEvidenceIdentity {
  readonly evidenceId: PhotoCaptureEvidenceId;
  readonly schemaVersion: string;
  readonly missionId: string;
  readonly missionVersion: string;
  readonly missionSessionId: string;
  readonly sessionGeneration: number;
  readonly objectiveId: PhotographyObjectiveId;
  readonly objectiveVersion: string;
  readonly attemptNumber: number;
  readonly locationId: string;
  readonly locationVersion: string;
  readonly locationGeneration: number;
  readonly capturedAtTick: SimulationTick;
  readonly missionElapsedTicks: ElapsedTicks;
  readonly scoringPolicyVersion: string;
}

export type AircraftEvidenceSourceType = 'factory' | 'user-compiled';

/**
 * Authoritative post-collision-correction aircraft state at capture time.
 * NO controller/stick/gamepad/calibration fields — see module doc.
 */
export interface AircraftEvidenceSnapshot {
  readonly aircraftId: string;
  readonly aircraftSourceType: AircraftEvidenceSourceType;
  readonly definitionVersion: string | null;
  readonly physicsProfileVersion: string | null;
  readonly runtimeCompatibilityVersion: string;
  readonly pose: Pose;
  readonly linearVelocityMps: Vec3;
  readonly bodyAngularVelocityRadps: Vec3;
  readonly altitudeMeters: number;
  readonly armed: boolean;
  readonly crashed: boolean;
  readonly positionZoneId?: PositionZoneId;
}

/** Canonical camera snapshot — world pose + projection, cosmetics excluded. */
export interface CameraEvidenceSnapshot {
  readonly rigId: string;
  readonly rigVersion: string;
  /** Resolution strategy / provenance (opaque string from the application). */
  readonly resolutionStrategy: string;
  readonly worldPose: Pose;
  readonly localMountPose?: Pose;
  readonly projection: CameraProjection;
  /** Pitch-up tilt relative to body forward (radians), when authored. */
  readonly cameraTiltRad?: number;
  readonly cameraMode: CameraMode;
  /** Always `true` — asserts cosmetic effects were stripped before capture. */
  readonly cosmeticEffectsExcluded: true;
  readonly templateDerivedCamera?: boolean;
}

export interface SpatialEvidenceContext {
  /** Fraction (0..1) of line-of-sight to the primary subject(s) that is unobstructed. */
  readonly lineOfSightRatio: number;
  /** Fraction (0..1) of the primary subject(s) that is obstructed. */
  readonly obstructionRatio: number;
  readonly distanceToPrimarySubjectMeters?: number;
}

export interface SubjectObservation {
  readonly subjectId: SubjectId;
  readonly boundsVersion: string;
  readonly visible: boolean;
  /** Exact authored visibility sample counts — never reconstructed from a rounded ratio. */
  readonly visibleSampleCount: number;
  readonly totalSampleCount: number;
  /** Fraction (0..1) of subject sample points that are visible/unobstructed. */
  readonly visibilityRatio: number;
  readonly obstructionRatio: number;
  /** Optional stable obstruction category summary from the spatial query. */
  readonly obstructionCategory?: string;
  readonly projectedAnchor: NormalizedScreenPoint | null;
  readonly screenRectangle: NormalizedScreenRectangle | null;
  readonly inFrontOfCamera: boolean;
  readonly centeringError: number | null;
  readonly distanceMeters: number;
  readonly viewingAngleDeg: number | null;
  readonly viewingSide: ViewingSide | null;
  readonly coverageRatio: number | null;
  readonly frameIntersectionRatio: number | null;
}

export interface StabilityEvidence {
  /** Authoritative linear speed used by the stability gate at capture. */
  readonly linearSpeedMps: number;
  /** Authoritative body angular speed used by the stability gate at capture. */
  readonly angularSpeedRadps: number;
  readonly stableDurationTicks: ElapsedTicks;
  readonly requiredDurationTicks: ElapsedTicks;
  readonly isStable: boolean;
}

export interface PhotoCaptureEvidence {
  readonly identity: PhotoCaptureEvidenceIdentity;
  readonly aircraftSnapshot: AircraftEvidenceSnapshot;
  readonly cameraSnapshot: CameraEvidenceSnapshot;
  readonly spatialContext: SpatialEvidenceContext;
  readonly subjectObservations: readonly SubjectObservation[];
  readonly stability: StabilityEvidence;
}

export interface PhotoCaptureEvidenceInput {
  readonly identity: PhotoCaptureEvidenceIdentity;
  readonly aircraftSnapshot: AircraftEvidenceSnapshot;
  readonly cameraSnapshot: CameraEvidenceSnapshot;
  readonly spatialContext: SpatialEvidenceContext;
  readonly subjectObservations: readonly SubjectObservation[];
  readonly stability: StabilityEvidence;
}

export type EvidenceConstructionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

function ok<T>(value: T): EvidenceConstructionResult<T> {
  return { ok: true, value };
}

function fail<T>(reason: string): EvidenceConstructionResult<T> {
  return { ok: false, reason };
}

function isRatio(value: unknown): value is number {
  return typeof value === 'number' && isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && isFiniteNumber(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && isFiniteNumber(value);
}

/** Exported for tests / defense-in-depth callers — scans an aircraft snapshot's own keys for forbidden terms. */
export function findForbiddenAircraftSnapshotKeys(snapshot: Readonly<Record<string, unknown>>): readonly string[] {
  const lowerTerms = FORBIDDEN_AIRCRAFT_SNAPSHOT_KEY_TERMS;
  return Object.keys(snapshot).filter((key) => {
    const lowerKey = key.toLowerCase();
    return lowerTerms.some((term) => lowerKey.includes(term));
  });
}

/**
 * Deep-freezes plain evidence trees so nested pose / vector / rectangle
 * objects cannot be mutated after construction.
 */
export function deepFreezeEvidence<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value as object)) {
    deepFreezeEvidence((value as Record<string, unknown>)[key]);
  }
  return value;
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Validates and constructs an immutable `PhotoCaptureEvidence`.
 *
 * Determinism/integrity notes:
 * - Rejects schema versions other than `EVIDENCE_SCHEMA_VERSION`.
 * - Rejects if `cosmeticEffectsExcluded !== true`.
 * - Rejects if the camera projection's `projectionModelVersion` is not
 *   major-compatible with this package's `PROJECTION_MODEL_VERSION`.
 * - Rejects if `stability.isStable` is inconsistent with
 *   `stableDurationTicks >= requiredDurationTicks`.
 * - The returned value is deeply frozen (nested pose/vector objects included).
 */
export function createPhotoCaptureEvidence(input: PhotoCaptureEvidenceInput): EvidenceConstructionResult<PhotoCaptureEvidence> {
  const { identity, aircraftSnapshot, cameraSnapshot, spatialContext, subjectObservations, stability } = input;

  // --- identity ---
  if (!isNonEmptyString(identity.schemaVersion)) {
    return fail('identity.schemaVersion must be a non-empty string');
  }
  if (identity.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    return fail(
      `identity.schemaVersion (${identity.schemaVersion}) must equal EVIDENCE_SCHEMA_VERSION (${EVIDENCE_SCHEMA_VERSION})`,
    );
  }
  if (!isNonEmptyString(identity.missionId)) {
    return fail('identity.missionId must be a non-empty string');
  }
  if (!isNonEmptyString(identity.missionVersion)) {
    return fail('identity.missionVersion must be a non-empty string');
  }
  if (!isNonEmptyString(identity.missionSessionId)) {
    return fail('identity.missionSessionId must be a non-empty string');
  }
  if (!isNonNegativeInteger(identity.sessionGeneration)) {
    return fail('identity.sessionGeneration must be a non-negative integer');
  }
  if (!isNonEmptyString(String(identity.objectiveId))) {
    return fail('identity.objectiveId must be a non-empty string');
  }
  if (!isNonEmptyString(identity.objectiveVersion)) {
    return fail('identity.objectiveVersion must be a non-empty string');
  }
  if (!isPositiveInteger(identity.attemptNumber)) {
    return fail('identity.attemptNumber must be a positive integer');
  }
  if (!isNonEmptyString(identity.locationId)) {
    return fail('identity.locationId must be a non-empty string');
  }
  if (!isNonEmptyString(identity.locationVersion)) {
    return fail('identity.locationVersion must be a non-empty string');
  }
  if (!isNonNegativeInteger(identity.locationGeneration)) {
    return fail('identity.locationGeneration must be a non-negative integer');
  }
  if (typeof identity.capturedAtTick !== 'number' || !isFiniteNumber(identity.capturedAtTick as unknown as number) || (identity.capturedAtTick as unknown as number) < 0) {
    return fail('identity.capturedAtTick must be a finite non-negative tick value');
  }
  if (
    typeof identity.missionElapsedTicks !== 'number' ||
    !isFiniteNumber(identity.missionElapsedTicks as unknown as number) ||
    (identity.missionElapsedTicks as unknown as number) < 0
  ) {
    return fail('identity.missionElapsedTicks must be a finite non-negative tick count');
  }
  if (!isNonEmptyString(identity.scoringPolicyVersion)) {
    return fail('identity.scoringPolicyVersion must be a non-empty string');
  }

  // --- aircraftSnapshot ---
  const forbiddenKeys = findForbiddenAircraftSnapshotKeys(aircraftSnapshot as unknown as Record<string, unknown>);
  if (forbiddenKeys.length > 0) {
    return fail(`aircraftSnapshot must not contain controller/calibration fields, found: ${forbiddenKeys.join(', ')}`);
  }
  if (!isNonEmptyString(aircraftSnapshot.aircraftId)) {
    return fail('aircraftSnapshot.aircraftId must be a non-empty string');
  }
  if (
    aircraftSnapshot.aircraftSourceType !== 'factory' &&
    aircraftSnapshot.aircraftSourceType !== 'user-compiled'
  ) {
    return fail('aircraftSnapshot.aircraftSourceType must be "factory" or "user-compiled"');
  }
  if (
    aircraftSnapshot.definitionVersion !== null &&
    !isNonEmptyString(aircraftSnapshot.definitionVersion)
  ) {
    return fail('aircraftSnapshot.definitionVersion must be null or a non-empty string');
  }
  if (
    aircraftSnapshot.physicsProfileVersion !== null &&
    !isNonEmptyString(aircraftSnapshot.physicsProfileVersion)
  ) {
    return fail('aircraftSnapshot.physicsProfileVersion must be null or a non-empty string');
  }
  if (!isNonEmptyString(aircraftSnapshot.runtimeCompatibilityVersion)) {
    return fail('aircraftSnapshot.runtimeCompatibilityVersion must be a non-empty string');
  }
  if (!isFinitePose(aircraftSnapshot.pose)) {
    return fail('aircraftSnapshot.pose must be finite');
  }
  if (!isFiniteVec3(aircraftSnapshot.linearVelocityMps)) {
    return fail('aircraftSnapshot.linearVelocityMps must be finite');
  }
  if (!isFiniteVec3(aircraftSnapshot.bodyAngularVelocityRadps)) {
    return fail('aircraftSnapshot.bodyAngularVelocityRadps must be finite');
  }
  if (!isFiniteNumber(aircraftSnapshot.altitudeMeters)) {
    return fail('aircraftSnapshot.altitudeMeters must be finite');
  }
  if (typeof aircraftSnapshot.armed !== 'boolean' || typeof aircraftSnapshot.crashed !== 'boolean') {
    return fail('aircraftSnapshot.armed/crashed must be boolean');
  }

  // --- cameraSnapshot ---
  if (cameraSnapshot.cosmeticEffectsExcluded !== true) {
    return fail('cameraSnapshot.cosmeticEffectsExcluded must be true');
  }
  if (!isNonEmptyString(cameraSnapshot.rigId)) {
    return fail('cameraSnapshot.rigId must be a non-empty string');
  }
  if (!isNonEmptyString(cameraSnapshot.rigVersion)) {
    return fail('cameraSnapshot.rigVersion must be a non-empty string');
  }
  if (!isNonEmptyString(cameraSnapshot.resolutionStrategy)) {
    return fail('cameraSnapshot.resolutionStrategy must be a non-empty string');
  }
  if (!isFinitePose(cameraSnapshot.worldPose)) {
    return fail('cameraSnapshot.worldPose must be finite');
  }
  if (cameraSnapshot.localMountPose !== undefined && !isFinitePose(cameraSnapshot.localMountPose)) {
    return fail('cameraSnapshot.localMountPose must be finite when present');
  }
  if (
    cameraSnapshot.cameraTiltRad !== undefined &&
    !isFiniteNumber(cameraSnapshot.cameraTiltRad)
  ) {
    return fail('cameraSnapshot.cameraTiltRad must be finite when present');
  }
  if (!isFiniteCameraProjection(cameraSnapshot.projection)) {
    return fail('cameraSnapshot.projection must be a valid finite projection');
  }
  if (!isCompatibleMajor(cameraSnapshot.projection.projectionModelVersion, PROJECTION_MODEL_VERSION)) {
    return fail(
      `cameraSnapshot.projection.projectionModelVersion (${cameraSnapshot.projection.projectionModelVersion}) is not major-compatible with PROJECTION_MODEL_VERSION (${PROJECTION_MODEL_VERSION})`,
    );
  }

  // --- spatialContext ---
  if (!isRatio(spatialContext.lineOfSightRatio)) {
    return fail('spatialContext.lineOfSightRatio must be a finite number in [0, 1]');
  }
  if (!isRatio(spatialContext.obstructionRatio)) {
    return fail('spatialContext.obstructionRatio must be a finite number in [0, 1]');
  }
  if (
    spatialContext.distanceToPrimarySubjectMeters !== undefined &&
    (!isFiniteNumber(spatialContext.distanceToPrimarySubjectMeters) || spatialContext.distanceToPrimarySubjectMeters < 0)
  ) {
    return fail('spatialContext.distanceToPrimarySubjectMeters must be a finite non-negative number when present');
  }

  // --- subjectObservations ---
  for (const observation of subjectObservations) {
    if (!isNonEmptyString(observation.boundsVersion)) {
      return fail(`subjectObservations[${String(observation.subjectId)}].boundsVersion must be a non-empty string`);
    }
    if (!isNonNegativeInteger(observation.visibleSampleCount)) {
      return fail(`subjectObservations[${String(observation.subjectId)}].visibleSampleCount must be a non-negative integer`);
    }
    if (!isNonNegativeInteger(observation.totalSampleCount)) {
      return fail(`subjectObservations[${String(observation.subjectId)}].totalSampleCount must be a non-negative integer`);
    }
    if (observation.visibleSampleCount > observation.totalSampleCount) {
      return fail(`subjectObservations[${String(observation.subjectId)}].visibleSampleCount cannot exceed totalSampleCount`);
    }
    if (!isRatio(observation.visibilityRatio)) {
      return fail(`subjectObservations[${String(observation.subjectId)}].visibilityRatio must be in [0, 1]`);
    }
    if (!isRatio(observation.obstructionRatio)) {
      return fail(`subjectObservations[${String(observation.subjectId)}].obstructionRatio must be in [0, 1]`);
    }
    if (typeof observation.inFrontOfCamera !== 'boolean') {
      return fail(`subjectObservations[${String(observation.subjectId)}].inFrontOfCamera must be boolean`);
    }
    if (!isFiniteNumber(observation.distanceMeters) || observation.distanceMeters < 0) {
      return fail(`subjectObservations[${String(observation.subjectId)}].distanceMeters must be a finite non-negative number`);
    }
    if (observation.centeringError !== null && (!isFiniteNumber(observation.centeringError) || observation.centeringError < 0)) {
      return fail(`subjectObservations[${String(observation.subjectId)}].centeringError must be null or a finite non-negative number`);
    }
    if (observation.viewingAngleDeg !== null && (!isFiniteNumber(observation.viewingAngleDeg) || observation.viewingAngleDeg < 0 || observation.viewingAngleDeg > 180)) {
      return fail(`subjectObservations[${String(observation.subjectId)}].viewingAngleDeg must be null or in [0, 180]`);
    }
    if (observation.coverageRatio !== null && !isRatio(observation.coverageRatio)) {
      return fail(`subjectObservations[${String(observation.subjectId)}].coverageRatio must be null or in [0, 1]`);
    }
    if (observation.frameIntersectionRatio !== null && !isRatio(observation.frameIntersectionRatio)) {
      return fail(`subjectObservations[${String(observation.subjectId)}].frameIntersectionRatio must be null or in [0, 1]`);
    }
    if (observation.projectedAnchor !== null) {
      if (!isFiniteNumber(observation.projectedAnchor.u) || !isFiniteNumber(observation.projectedAnchor.v)) {
        return fail(`subjectObservations[${String(observation.subjectId)}].projectedAnchor must be finite when present`);
      }
    }
    if (observation.screenRectangle !== null) {
      const rect = observation.screenRectangle;
      if (
        !isFiniteNumber(rect.minU) ||
        !isFiniteNumber(rect.minV) ||
        !isFiniteNumber(rect.maxU) ||
        !isFiniteNumber(rect.maxV)
      ) {
        return fail(`subjectObservations[${String(observation.subjectId)}].screenRectangle must be finite when present`);
      }
    }
  }

  // --- stability ---
  if (!isFiniteNumber(stability.linearSpeedMps) || stability.linearSpeedMps < 0) {
    return fail('stability.linearSpeedMps must be a finite non-negative number');
  }
  if (!isFiniteNumber(stability.angularSpeedRadps) || stability.angularSpeedRadps < 0) {
    return fail('stability.angularSpeedRadps must be a finite non-negative number');
  }
  if (!isFiniteNumber(stability.stableDurationTicks as unknown as number) || (stability.stableDurationTicks as unknown as number) < 0) {
    return fail('stability.stableDurationTicks must be a finite non-negative tick count');
  }
  if (!isFiniteNumber(stability.requiredDurationTicks as unknown as number) || (stability.requiredDurationTicks as unknown as number) < 0) {
    return fail('stability.requiredDurationTicks must be a finite non-negative tick count');
  }
  const expectedIsStable = (stability.stableDurationTicks as unknown as number) >= (stability.requiredDurationTicks as unknown as number);
  if (stability.isStable !== expectedIsStable) {
    return fail('stability.isStable must equal (stableDurationTicks >= requiredDurationTicks)');
  }

  const cloned = clonePlain({
    identity,
    aircraftSnapshot,
    cameraSnapshot,
    spatialContext,
    subjectObservations,
    stability,
  } satisfies PhotoCaptureEvidence);

  return ok(deepFreezeEvidence(cloned));
}
