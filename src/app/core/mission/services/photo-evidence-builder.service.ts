import { Injectable, inject } from '@angular/core';

import type { BoundaryShape, PhotographySubjectDefinition } from '@fpv/location-domain';
import { pointInBoundaryShape } from '@fpv/location-validation';
import {
  SCREEN_CENTER,
  asPhotoCaptureEvidenceId,
  asPositionZoneId,
  asSubjectId,
  centeringError,
  computeNormalizedScreenRectangle,
  coverageRatio,
  createPhotoCaptureEvidence,
  distance,
  evaluateViewingSide,
  frameIntersectionRatio,
  projectSubjectSamplePoints,
  projectWorldPoint,
  viewingAngle,
  EVIDENCE_SCHEMA_VERSION,
  type PhotoCaptureEvidence,
  type PhotographyObjectiveDefinition,
  type PositionZoneId,
  type SubjectObservation,
} from '@fpv/photography-domain';
import {
  asElapsedTicks,
  asSimulationTick,
  type CameraSnapshot,
  type NormalizedScreenPoint,
  type Vec3,
} from '@fpv/simulation-contracts';

import type { AuthoritativeFlightStepSnapshot } from '../../flight-runtime/models/authoritative-flight-step-snapshot';
import { UnavailableMissionSpatialQueryAdapter } from '../adapters/unavailable-mission-spatial-query.adapter';
import type { MissionRuntimeDiagnostic } from '../models/mission-runtime-diagnostics';
import type { MissionSpatialQueryPort } from '../ports/mission-spatial-query.port';
import { MISSION_SPATIAL_QUERY } from '../ports/mission-spatial-query.token';
import type { PhotoStabilityWindowSnapshot } from './photo-stability-window';

/** A location-authored zone the aircraft position may be tested against. */
export interface MissionZoneShape {
  readonly zoneId: string;
  readonly shape: BoundaryShape;
}

export interface PhotoEvidenceBuildInput {
  readonly sessionId: string;
  readonly attemptNumber: number;
  readonly flight: AuthoritativeFlightStepSnapshot;
  /** Canonical, cosmetics-free camera snapshot for the same fixed step. */
  readonly camera: CameraSnapshot;
  readonly objective: PhotographyObjectiveDefinition;
  readonly subjects: readonly PhotographySubjectDefinition[];
  readonly stability: PhotoStabilityWindowSnapshot;
  readonly locationGeneration: number;
  readonly sessionGeneration: number;
  readonly zones?: readonly MissionZoneShape[];
}

export type PhotoEvidenceBuildResult =
  | { readonly ok: true; readonly evidence: PhotoCaptureEvidence; readonly evidenceId: string }
  | { readonly ok: false; readonly diagnostic: MissionRuntimeDiagnostic };

/**
 * Builds `PhotoCaptureEvidence` from one authoritative fixed-step
 * observation plus authored subject content.
 *
 * Visibility is sourced exclusively from `MissionSpatialQueryPort`; when the
 * port is unavailable or stale this fails with
 * `PHOTO_CAPTURE_SPATIAL_UNAVAILABLE` rather than inventing clear
 * line-of-sight. Projection/framing math is delegated to
 * `@fpv/photography-domain`'s pure helpers.
 */
@Injectable({ providedIn: 'root' })
export class PhotoEvidenceBuilder {
  private readonly spatial = inject(MISSION_SPATIAL_QUERY, {
    optional: true,
  }) as MissionSpatialQueryPort | null;
  private readonly spatialFallback = inject(UnavailableMissionSpatialQueryAdapter);

  private get spatialPort(): MissionSpatialQueryPort {
    return this.spatial ?? this.spatialFallback;
  }

  build(input: PhotoEvidenceBuildInput): PhotoEvidenceBuildResult {
    const { objective, camera } = input;
    const evidenceId = buildCaptureId(
      input.sessionId,
      String(objective.objectiveId),
      input.attemptNumber,
    );

    const observedSubjectIds = [
      ...objective.requiredSubjectIds,
      ...(objective.secondarySubjectIds ?? []),
    ].map((id) => String(id));
    const uniqueSubjectIds = [...new Set(observedSubjectIds)];

    const observations: SubjectObservation[] = [];
    for (const subjectId of uniqueSubjectIds) {
      const subject = input.subjects.find((candidate) => String(candidate.id) === subjectId);
      if (!subject) {
        return {
          ok: false,
          diagnostic: {
            code: 'PHOTO_CAPTURE_EVIDENCE_INVALID',
            message: `Objective subject "${subjectId}" is not present in the loaded location`,
            details: { evidenceId, subjectId },
          },
        };
      }

      const visibility = this.spatialPort.queryVisibilitySamples({
        originWorld: camera.worldPose.position,
        samplePointsWorld: subject.visibilitySamplePoints,
        targetSubjectId: subjectId,
        expectedLocationGeneration: input.locationGeneration,
        expectedSessionGeneration: input.sessionGeneration,
      });
      if (visibility.status !== 'ok' || visibility.visibleFraction === null) {
        return {
          ok: false,
          diagnostic: {
            code: 'PHOTO_CAPTURE_SPATIAL_UNAVAILABLE',
            message:
              visibility.diagnosticMessage ??
              'Mission spatial query could not resolve subject visibility',
            details: {
              evidenceId,
              subjectId,
              status: visibility.status,
              spatialDiagnosticCode: visibility.diagnosticCode ?? null,
            },
          },
        };
      }

      const observation = this.buildSubjectObservation(
        subject,
        visibility.visibleFraction,
        objective,
        camera,
      );
      if (!observation.ok) {
        return {
          ok: false,
          diagnostic: {
            code: 'PHOTO_CAPTURE_EVIDENCE_INVALID',
            message: observation.reason,
            details: { evidenceId, subjectId },
          },
        };
      }
      observations.push(observation.value);
    }

    const primaryIds = new Set(objective.primarySubjectIds.map((id) => String(id)));
    const primaryObservations = observations.filter((observation) =>
      primaryIds.has(String(observation.subjectId)),
    );
    const ratioSource = primaryObservations.length > 0 ? primaryObservations : observations;
    const lineOfSightRatio = clamp01(averageOf(ratioSource.map((o) => o.visibilityRatio)) ?? 0);
    const primaryDistances = ratioSource.map((o) => o.distanceMeters);

    const stableTicks = input.stability.continuousStableTicks;
    const requiredTicks = objective.stabilityDurationTicks as unknown as number;

    const constructed = createPhotoCaptureEvidence({
      identity: {
        evidenceId: asPhotoCaptureEvidenceId(evidenceId),
        objectiveId: objective.objectiveId,
        missionAttemptId: input.sessionId,
        attemptNumber: input.attemptNumber,
        capturedAtTick: asSimulationTick(input.flight.simulationTick),
        schemaVersion: EVIDENCE_SCHEMA_VERSION,
      },
      aircraftSnapshot: {
        aircraftId: input.flight.aircraftId,
        pose: input.flight.pose,
        linearVelocityMps: input.flight.linearVelocity,
        bodyAngularVelocityRadps: toBodyAngularVelocityVec3(input.flight.bodyAngularVelocity),
        altitudeMeters: input.flight.altitudeMeters,
        armed: input.flight.armed,
        crashed: input.flight.crashed,
        ...resolvePositionZone(objective, input),
      },
      cameraSnapshot: {
        worldPose: camera.worldPose,
        projection: camera.projection,
        cameraMode: 'fpv',
        cosmeticEffectsExcluded: true,
      },
      spatialContext: {
        lineOfSightRatio,
        obstructionRatio: clamp01(1 - lineOfSightRatio),
        ...(primaryDistances.length > 0
          ? { distanceToPrimarySubjectMeters: Math.min(...primaryDistances) }
          : {}),
      },
      subjectObservations: observations,
      stability: {
        stableDurationTicks: asElapsedTicks(stableTicks),
        requiredDurationTicks: asElapsedTicks(requiredTicks),
        isStable: stableTicks >= requiredTicks,
      },
    });

    if (!constructed.ok) {
      return {
        ok: false,
        diagnostic: {
          code: 'PHOTO_CAPTURE_EVIDENCE_INVALID',
          message: constructed.reason,
          details: { evidenceId },
        },
      };
    }

    return { ok: true, evidence: constructed.value, evidenceId };
  }

  private buildSubjectObservation(
    subject: PhotographySubjectDefinition,
    visibilityRatio: number,
    objective: PhotographyObjectiveDefinition,
    camera: CameraSnapshot,
  ):
    | { readonly ok: true; readonly value: SubjectObservation }
    | { readonly ok: false; readonly reason: string } {
    const projected = projectSubjectSamplePoints(subject.visibilitySamplePoints, camera);
    if (!projected.ok) {
      return { ok: false, reason: projected.reason };
    }

    const rectangle = computeNormalizedScreenRectangle(projected.value);
    const screenRectangle = rectangle.ok ? rectangle.value : null;

    const anchorProjection = projectWorldPoint(subject.scoringAnchor, camera);
    if (!anchorProjection.ok) {
      return { ok: false, reason: anchorProjection.reason };
    }
    const anchorScreen: NormalizedScreenPoint | null = anchorProjection.value.screen;

    // Centering is measured against the objective's authored target anchor
    // (`SCREEN_CENTER` when the objective does not move it off-center).
    const centeringTarget = objective.centeringTarget.targetAnchor ?? SCREEN_CENTER;

    const angle = viewingAngle(camera.worldPose, subject.scoringAnchor);
    const side = evaluateViewingSide(camera.worldPose, subject.worldPose);

    return {
      ok: true,
      value: {
        subjectId: asSubjectId(String(subject.id)),
        visible: visibilityRatio >= objective.visibilityMin,
        visibilityRatio: clamp01(visibilityRatio),
        screenRectangle,
        centeringErrorFromCenter:
          anchorScreen === null ? null : centeringError(anchorScreen, centeringTarget),
        distanceMeters: distance(camera.worldPose.position, subject.scoringAnchor),
        viewingAngleDeg: angle.ok ? angle.value : null,
        viewingSide: side.ok ? side.value.side : null,
        coverageRatio: screenRectangle === null ? null : coverageRatio(screenRectangle),
        frameIntersectionRatio:
          screenRectangle === null ? null : frameIntersectionRatio(screenRectangle),
      },
    };
  }
}

/** Stable capture identity: `${sessionId}:${objectiveId}:${attemptNumber}`. */
export function buildCaptureId(
  sessionId: string,
  objectiveId: string,
  attemptNumber: number,
): string {
  return `${sessionId}:${objectiveId}:${attemptNumber}`;
}

/**
 * Maps flight-runtime body angular rates onto the evidence `Vec3`.
 *
 * Authoritative flight snapshots store named body-frame rates
 * (`{ pitch, yaw, roll }`, rad/s). Evidence and scoring consume a `Vec3`.
 * The repository's existing storage convention (shared with
 * `angularToReplay` in replay models) is:
 *
 * ```text
 * x = pitch   (body +X rate axis; ω_x = −pitch in quat-math)
 * y = yaw     (body +Y rate axis; ω_y = −yaw)
 * z = roll    (body −Z / forward rate axis; ω_z = −roll)
 * ```
 *
 * This is NOT aerospace [roll, pitch, yaw] ordering. Do not reinterpret.
 * Magnitude for stability gating uses `bodyAngularSpeedMagnitude` on the
 * named rates directly so a mapping mistake cannot silently change speed.
 */
export function toBodyAngularVelocityVec3(rates: {
  readonly pitch: number;
  readonly yaw: number;
  readonly roll: number;
}): Vec3 {
  return { x: rates.pitch, y: rates.yaw, z: rates.roll };
}

function resolvePositionZone(
  objective: PhotographyObjectiveDefinition,
  input: PhotoEvidenceBuildInput,
): { positionZoneId?: PositionZoneId } {
  const requiredZoneId = objective.requiredAircraftPositionZoneId;
  if (requiredZoneId === undefined) {
    return {};
  }
  const zone = (input.zones ?? []).find(
    (candidate) => candidate.zoneId === String(requiredZoneId),
  );
  if (!zone) {
    return {};
  }
  return pointInBoundaryShape(input.flight.pose.position, zone.shape)
    ? { positionZoneId: asPositionZoneId(zone.zoneId) }
    : {};
}

function averageOf(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
