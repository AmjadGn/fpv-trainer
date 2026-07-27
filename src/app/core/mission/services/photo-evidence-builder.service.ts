import { Injectable, inject } from '@angular/core';

import type { BoundaryShape, PhotographySubjectDefinition } from '@fpv/location-domain';
import { pointInBoundaryShape } from '@fpv/location-validation';
import {
  SCREEN_CENTER,
  asPhotoCaptureEvidenceId,
  asPositionZoneId,
  asSubjectId,
  centeringError,
  coverageRatio,
  createPhotoCaptureEvidence,
  distance,
  evaluateViewingSide,
  frameIntersectionRatio,
  projectSubjectBounds,
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
  type Pose,
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

/** Canonical camera-rig provenance supplied by the mission runtime (not Angular singletons). */
export interface PhotoEvidenceCameraRigContext {
  readonly rigId: string;
  readonly rigVersion: string;
  readonly resolutionStrategy: string;
  readonly cameraTiltRad?: number;
  readonly templateDerivedCamera?: boolean;
}

/**
 * All durable evidence context must arrive here. The builder must not query
 * Angular singleton state for mission/location/session/policy versions.
 */
export interface PhotoEvidenceBuildInput {
  readonly sessionId: string;
  readonly sessionGeneration: number;
  readonly locationGeneration: number;
  readonly attemptNumber: number;
  readonly missionId: string;
  readonly missionVersion: string;
  readonly locationId: string;
  readonly locationVersion: string;
  readonly scoringPolicyVersion: string;
  readonly missionElapsedTicks: number;
  readonly flight: AuthoritativeFlightStepSnapshot;
  /** Canonical, cosmetics-free camera snapshot for the same fixed step. */
  readonly camera: CameraSnapshot;
  readonly cameraRig: PhotoEvidenceCameraRigContext;
  readonly objective: PhotographyObjectiveDefinition;
  readonly subjects: readonly PhotographySubjectDefinition[];
  readonly stability: PhotoStabilityWindowSnapshot;
  readonly zones?: readonly MissionZoneShape[];
}

export type PhotoEvidenceBuildResult =
  | { readonly ok: true; readonly evidence: PhotoCaptureEvidence; readonly evidenceId: string }
  | { readonly ok: false; readonly diagnostic: MissionRuntimeDiagnostic };

/**
 * Builds `PhotoCaptureEvidence` from one authoritative fixed-step
 * observation plus authored subject content.
 *
 * Framing/coverage use `subject.subjectBounds`. Visibility uses
 * `subject.visibilitySamplePoints` via `MissionSpatialQueryPort` only.
 * When the port is unavailable or stale this fails with
 * `PHOTO_CAPTURE_SPATIAL_UNAVAILABLE` rather than inventing clear LOS.
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
      input.sessionGeneration,
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
      if (
        visibility.status !== 'ok' ||
        visibility.visibleFraction === null ||
        visibility.visibleSampleCount === null
      ) {
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
        visibility.visibleSampleCount,
        visibility.totalSampleCount,
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
    const linearSpeedMps =
      input.stability.lastLinearSpeedMps ?? magnitudeVec3(input.flight.linearVelocity);
    const angularSpeedRadps =
      input.stability.lastBodyAngularSpeedRadps ??
      bodyAngularSpeedFromRates(input.flight.bodyAngularVelocity);

    const constructed = createPhotoCaptureEvidence({
      identity: {
        evidenceId: asPhotoCaptureEvidenceId(evidenceId),
        schemaVersion: EVIDENCE_SCHEMA_VERSION,
        missionId: input.missionId,
        missionVersion: input.missionVersion,
        missionSessionId: input.sessionId,
        sessionGeneration: input.sessionGeneration,
        objectiveId: objective.objectiveId,
        objectiveVersion: objective.version,
        attemptNumber: input.attemptNumber,
        locationId: input.locationId,
        locationVersion: input.locationVersion,
        locationGeneration: input.locationGeneration,
        capturedAtTick: asSimulationTick(input.flight.simulationTick),
        missionElapsedTicks: asElapsedTicks(input.missionElapsedTicks),
        scoringPolicyVersion: input.scoringPolicyVersion,
      },
      aircraftSnapshot: {
        aircraftId: input.flight.aircraftId,
        aircraftSourceType: input.flight.aircraftSourceType,
        definitionVersion: input.flight.definitionVersion,
        physicsProfileVersion: input.flight.physicsProfileVersion,
        runtimeCompatibilityVersion: input.flight.runtimeCompatibilityVersion,
        pose: input.flight.pose,
        linearVelocityMps: input.flight.linearVelocity,
        bodyAngularVelocityRadps: toBodyAngularVelocityVec3(input.flight.bodyAngularVelocity),
        altitudeMeters: input.flight.altitudeMeters,
        armed: input.flight.armed,
        crashed: input.flight.crashed,
        ...resolvePositionZone(objective, input),
      },
      cameraSnapshot: {
        rigId: input.cameraRig.rigId,
        rigVersion: input.cameraRig.rigVersion,
        resolutionStrategy: input.cameraRig.resolutionStrategy,
        worldPose: camera.worldPose,
        ...(camera.localMountPose ? { localMountPose: camera.localMountPose } : {}),
        projection: camera.projection,
        ...(input.cameraRig.cameraTiltRad !== undefined
          ? { cameraTiltRad: input.cameraRig.cameraTiltRad }
          : {}),
        cameraMode: 'fpv',
        cosmeticEffectsExcluded: true,
        ...(input.cameraRig.templateDerivedCamera !== undefined
          ? { templateDerivedCamera: input.cameraRig.templateDerivedCamera }
          : {}),
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
        linearSpeedMps,
        angularSpeedRadps,
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
    visibleSampleCount: number,
    totalSampleCount: number,
    visibilityRatio: number,
    objective: PhotographyObjectiveDefinition,
    camera: CameraSnapshot,
  ):
    | { readonly ok: true; readonly value: SubjectObservation }
    | { readonly ok: false; readonly reason: string } {
    const boundsProjection = projectSubjectBounds(subject.subjectBounds, camera);
    if (!boundsProjection.ok) {
      return { ok: false, reason: boundsProjection.reason };
    }

    const screenRectangle = boundsProjection.value.screenRectangle;

    const anchorProjection = projectWorldPoint(subject.scoringAnchor, camera);
    if (!anchorProjection.ok) {
      return { ok: false, reason: anchorProjection.reason };
    }
    const projectedAnchor: NormalizedScreenPoint | null = anchorProjection.value.screen;

    const centeringTarget = objective.centeringTarget.targetAnchor ?? SCREEN_CENTER;

    const angle = viewingAngle(camera.worldPose, subject.scoringAnchor);
    const side = evaluateViewingSide(camera.worldPose, subject.worldPose);
    const clampedVisibility = clamp01(visibilityRatio);

    return {
      ok: true,
      value: {
        subjectId: asSubjectId(String(subject.id)),
        boundsVersion: subject.boundsVersion,
        visible: clampedVisibility >= objective.visibilityMin,
        visibleSampleCount,
        totalSampleCount,
        visibilityRatio: clampedVisibility,
        obstructionRatio: clamp01(1 - clampedVisibility),
        projectedAnchor,
        screenRectangle,
        inFrontOfCamera: anchorProjection.value.inFrontOfCamera,
        centeringError:
          projectedAnchor === null ? null : centeringError(projectedAnchor, centeringTarget),
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

/**
 * Stable capture identity across retries:
 * `${sessionId}:g${sessionGeneration}:${objectiveId}:${attemptNumber}`.
 */
export function buildCaptureId(
  sessionId: string,
  sessionGeneration: number,
  objectiveId: string,
  attemptNumber: number,
): string {
  return `${sessionId}:g${sessionGeneration}:${objectiveId}:${attemptNumber}`;
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

function bodyAngularSpeedFromRates(rates: {
  readonly pitch: number;
  readonly yaw: number;
  readonly roll: number;
}): number {
  return Math.hypot(rates.pitch, rates.yaw, rates.roll);
}

function magnitudeVec3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
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

/** @internal exported for tests — clone a pose without sharing nested refs. */
export function clonePose(pose: Pose): Pose {
  return {
    position: { ...pose.position },
    orientation: { ...pose.orientation },
  };
}
