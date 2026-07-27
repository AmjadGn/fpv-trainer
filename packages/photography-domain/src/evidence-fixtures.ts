/**
 * Fixture helpers shared by photography-domain evidence / scoring tests.
 */

import {
  asElapsedTicks,
  asSimulationTick,
  IDENTITY_QUAT,
  PROJECTION_MODEL_VERSION,
} from '@fpv/simulation-contracts';
import { asPhotoCaptureEvidenceId, asPhotographyObjectiveId, asSubjectId } from './ids';
import {
  createPhotoCaptureEvidence,
  EVIDENCE_SCHEMA_VERSION,
  type PhotoCaptureEvidence,
  type PhotoCaptureEvidenceInput,
  type SubjectObservation,
} from './evidence';

const OBJECTIVE_ID = asPhotographyObjectiveId('obj-golden-1');
const SUBJECT_A = asSubjectId('subject-a');
const SUBJECT_B = asSubjectId('subject-b');
const STABILITY_TICKS = asElapsedTicks(60);

export function baseSubjectObservation(
  overrides: Partial<SubjectObservation> & Pick<SubjectObservation, 'subjectId'> ,
): SubjectObservation {
  return {
    boundsVersion: '1.0.0',
    visible: true,
    visibleSampleCount: 4,
    totalSampleCount: 4,
    visibilityRatio: 1,
    obstructionRatio: 0,
    projectedAnchor: { u: 0.5, v: 0.5 },
    screenRectangle: { minU: 0.45, minV: 0.45, maxU: 0.55, maxV: 0.55 },
    inFrontOfCamera: true,
    centeringError: 0,
    distanceMeters: 10,
    viewingAngleDeg: 0,
    viewingSide: 'front',
    coverageRatio: 0.2,
    frameIntersectionRatio: 1,
    ...overrides,
  };
}

export function baseEvidenceInput(
  overrides: Partial<PhotoCaptureEvidenceInput> = {},
): PhotoCaptureEvidenceInput {
  const pose = { position: { x: 0, y: 20, z: 0 }, orientation: IDENTITY_QUAT };
  return {
    identity: {
      evidenceId: asPhotoCaptureEvidenceId('evidence-1'),
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      missionId: 'mission-golden',
      missionVersion: '1.0.0',
      missionSessionId: 'session-golden',
      sessionGeneration: 1,
      objectiveId: OBJECTIVE_ID,
      objectiveVersion: '1.0.0',
      attemptNumber: 1,
      locationId: 'location-golden',
      locationVersion: '1.0.0',
      locationGeneration: 1,
      capturedAtTick: asSimulationTick(1000),
      missionElapsedTicks: asElapsedTicks(1000),
      scoringPolicyVersion: '1.0.0',
    },
    aircraftSnapshot: {
      aircraftId: 'aircraft-1',
      aircraftSourceType: 'factory',
      definitionVersion: '1.0.0',
      physicsProfileVersion: '1.0.0',
      runtimeCompatibilityVersion: '1.3.0-runtime-c3',
      pose,
      linearVelocityMps: { x: 0, y: 0, z: 0 },
      bodyAngularVelocityRadps: { x: 0, y: 0, z: 0 },
      altitudeMeters: 20,
      armed: true,
      crashed: false,
    },
    cameraSnapshot: {
      rigId: 'test-rig',
      rigVersion: '1.0.0',
      resolutionStrategy: 'aircraft-profile-v1',
      worldPose: pose,
      localMountPose: {
        position: { x: 0, y: 0.12, z: -0.18 },
        orientation: IDENTITY_QUAT,
      },
      projection: {
        verticalFovDegrees: 90,
        aspectRatio: 16 / 9,
        nearMeters: 0.1,
        farMeters: 1000,
        projectionModelVersion: PROJECTION_MODEL_VERSION,
      },
      cameraTiltRad: 0,
      cameraMode: 'fpv',
      cosmeticEffectsExcluded: true,
      templateDerivedCamera: false,
    },
    spatialContext: {
      lineOfSightRatio: 1,
      obstructionRatio: 0,
      distanceToPrimarySubjectMeters: 10,
    },
    subjectObservations: [
      baseSubjectObservation({ subjectId: SUBJECT_A }),
      baseSubjectObservation({
        subjectId: SUBJECT_B,
        visibilityRatio: 0.9,
        visibleSampleCount: 3,
        totalSampleCount: 4,
        obstructionRatio: 0.1,
        screenRectangle: null,
        projectedAnchor: null,
        centeringError: null,
        coverageRatio: null,
        frameIntersectionRatio: null,
        distanceMeters: 15,
        viewingAngleDeg: 10,
      }),
    ],
    stability: {
      linearSpeedMps: 0,
      angularSpeedRadps: 0,
      stableDurationTicks: STABILITY_TICKS,
      requiredDurationTicks: STABILITY_TICKS,
      isStable: true,
    },
    ...overrides,
  };
}

export function buildEvidence(overrides: Partial<PhotoCaptureEvidenceInput> = {}): PhotoCaptureEvidence {
  const result = createPhotoCaptureEvidence(baseEvidenceInput(overrides));
  if (!result.ok) {
    throw new Error(`Fixture evidence construction failed: ${result.reason}`);
  }
  return result.value;
}

export { OBJECTIVE_ID, SUBJECT_A, SUBJECT_B, STABILITY_TICKS };
