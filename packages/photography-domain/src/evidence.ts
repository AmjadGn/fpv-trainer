/**
 * `PhotoCaptureEvidence` — an immutable, schema-versioned record of a single
 * photo-capture attempt, built by the application layer from
 * post-collision-correction aircraft state and a canonical (cosmetics-free)
 * camera snapshot.
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
  type NormalizedScreenRectangle,
  type Pose,
  type SimulationTick,
  type Vec3,
} from '@fpv/simulation-contracts';
import type { PhotoCaptureEvidenceId, PhotographyObjectiveId, PositionZoneId, SubjectId } from './ids';
import type { CameraMode } from './objective';
import type { ViewingSide } from './projection';

export const EVIDENCE_SCHEMA_VERSION = '1.0.0';

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

export interface PhotoCaptureEvidenceIdentity {
  readonly evidenceId: PhotoCaptureEvidenceId;
  readonly objectiveId: PhotographyObjectiveId;
  /** Opaque string — this package does not model mission/attempt structure itself. */
  readonly missionAttemptId?: string;
  readonly attemptNumber: number;
  readonly capturedAtTick: SimulationTick;
  readonly schemaVersion: string;
}

/**
 * Authoritative post-collision-correction aircraft state at capture time.
 * NO controller/stick/gamepad/calibration fields — see module doc.
 */
export interface AircraftEvidenceSnapshot {
  readonly aircraftId: string;
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
  readonly worldPose: Pose;
  readonly projection: CameraProjection;
  readonly cameraMode: CameraMode;
  /** Always `true` — asserts cosmetic effects (shake, look-lag, FOV offset) were stripped before capture. */
  readonly cosmeticEffectsExcluded: true;
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
  readonly visible: boolean;
  /** Fraction (0..1) of subject sample points that are visible/unobstructed. */
  readonly visibilityRatio: number;
  readonly screenRectangle: NormalizedScreenRectangle | null;
  readonly centeringErrorFromCenter: number | null;
  readonly distanceMeters: number;
  readonly viewingAngleDeg: number | null;
  readonly viewingSide: ViewingSide | null;
  readonly coverageRatio: number | null;
  readonly frameIntersectionRatio: number | null;
}

export interface StabilityEvidence {
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

/** Exported for tests / defense-in-depth callers — scans an aircraft snapshot's own keys for forbidden terms. */
export function findForbiddenAircraftSnapshotKeys(snapshot: Readonly<Record<string, unknown>>): readonly string[] {
  const lowerTerms = FORBIDDEN_AIRCRAFT_SNAPSHOT_KEY_TERMS;
  return Object.keys(snapshot).filter((key) => {
    const lowerKey = key.toLowerCase();
    return lowerTerms.some((term) => lowerKey.includes(term));
  });
}

function freezeShallow<T>(value: T): T {
  return Object.freeze(value);
}

/**
 * Validates and constructs an immutable `PhotoCaptureEvidence`.
 *
 * Determinism/integrity notes:
 * - Rejects if `cosmeticEffectsExcluded !== true`.
 * - Rejects if the camera projection's `projectionModelVersion` is not
 *   major-compatible with this package's `PROJECTION_MODEL_VERSION`
 *   (from `@fpv/simulation-contracts`) — evidence captured under an
 *   incompatible projection model cannot be safely scored.
 * - Rejects if `stability.isStable` is inconsistent with
 *   `stableDurationTicks >= requiredDurationTicks` (scoring trusts this
 *   invariant rather than recomputing it).
 * - The returned value (and its direct nested category objects) is frozen.
 */
export function createPhotoCaptureEvidence(input: PhotoCaptureEvidenceInput): EvidenceConstructionResult<PhotoCaptureEvidence> {
  const { identity, aircraftSnapshot, cameraSnapshot, spatialContext, subjectObservations, stability } = input;

  // --- identity ---
  if (!identity || typeof identity.attemptNumber !== 'number' || !Number.isInteger(identity.attemptNumber) || identity.attemptNumber < 1) {
    return fail('identity.attemptNumber must be a positive integer');
  }
  if (typeof identity.capturedAtTick !== 'number' || !isFiniteNumber(identity.capturedAtTick as unknown as number)) {
    return fail('identity.capturedAtTick must be a finite tick value');
  }
  if (typeof identity.schemaVersion !== 'string' || identity.schemaVersion.length === 0) {
    return fail('identity.schemaVersion must be a non-empty string');
  }

  // --- aircraftSnapshot ---
  const forbiddenKeys = findForbiddenAircraftSnapshotKeys(aircraftSnapshot as unknown as Record<string, unknown>);
  if (forbiddenKeys.length > 0) {
    return fail(`aircraftSnapshot must not contain controller/calibration fields, found: ${forbiddenKeys.join(', ')}`);
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
  if (!isFinitePose(cameraSnapshot.worldPose)) {
    return fail('cameraSnapshot.worldPose must be finite');
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
    if (!isRatio(observation.visibilityRatio)) {
      return fail(`subjectObservations[${String(observation.subjectId)}].visibilityRatio must be in [0, 1]`);
    }
    if (!isFiniteNumber(observation.distanceMeters) || observation.distanceMeters < 0) {
      return fail(`subjectObservations[${String(observation.subjectId)}].distanceMeters must be a finite non-negative number`);
    }
    if (observation.centeringErrorFromCenter !== null && (!isFiniteNumber(observation.centeringErrorFromCenter) || observation.centeringErrorFromCenter < 0)) {
      return fail(`subjectObservations[${String(observation.subjectId)}].centeringErrorFromCenter must be null or a finite non-negative number`);
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
  }

  // --- stability ---
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

  const evidence: PhotoCaptureEvidence = {
    identity: freezeShallow({ ...identity }),
    aircraftSnapshot: freezeShallow({ ...aircraftSnapshot }),
    cameraSnapshot: freezeShallow({ ...cameraSnapshot }),
    spatialContext: freezeShallow({ ...spatialContext }),
    subjectObservations: Object.freeze(subjectObservations.map((observation) => freezeShallow({ ...observation }))),
    stability: freezeShallow({ ...stability }),
  };

  return ok(freezeShallow(evidence));
}
