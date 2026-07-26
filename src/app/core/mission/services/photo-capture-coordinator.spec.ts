import { TestBed } from '@angular/core/testing';

import { asObjectiveId } from '@fpv/mission-domain';
import {
  asPhotoCaptureEvidenceId,
  asPhotographyObjectiveId,
  asSubjectId,
  createDefaultPhotographyScoringPolicy,
  type PhotoCaptureEvidence,
  type PhotographyObjectiveDefinition,
} from '@fpv/photography-domain';
import { asElapsedTicks, asSimulationTick, type CameraSnapshot } from '@fpv/simulation-contracts';

import type { AuthoritativeFlightStepSnapshot } from '../../flight-runtime/models/authoritative-flight-step-snapshot';
import {
  MISSION_PHOTO_PRESENTATION_CAPTURE,
  type MissionPhotoPresentationCapturePort,
} from '../ports/mission-photo-presentation-capture.port';
import { MissionObjectiveRuntime, type ActivePhotographyObjective } from './mission-objective-runtime.service';
import { MissionResultsFacade } from './mission-results.facade';
import type { MissionRuntimeObservation } from './mission-runtime-coordinator.service';
import { PhotoCaptureCoordinator } from './photo-capture-coordinator.service';
import { PhotoEvidenceBuilder, type PhotoEvidenceBuildResult } from './photo-evidence-builder.service';
import { PhotoStabilityWindow } from './photo-stability-window';

const OBJECTIVE_ID = asPhotographyObjectiveId('test-photo-objective');
const MISSION_OBJECTIVE_ID = asObjectiveId('mission-obj-1');

/** A permissive objective definition with no required subjects, so scoring never hard-fails on visibility. */
const TEST_OBJECTIVE: PhotographyObjectiveDefinition = {
  objectiveId: OBJECTIVE_ID,
  version: '1.0.0',
  requiredSubjectIds: [],
  minRequiredSubjectCount: 0,
  primarySubjectIds: [],
  visibilityMin: 0,
  coverageRange: { min: 0, max: 1 },
  centeringTarget: { targetAnchor: { u: 0.5, v: 0.5 }, maxCenteringError: 1 },
  cameraToSubjectDistanceRange: { min: 0, max: 1000 },
  viewingAngleRangeDeg: { min: 0, max: 180 },
  allowedViewingSides: ['front', 'back', 'left', 'right'],
  altitudeRange: { minMeters: 0, maxMeters: 1000 },
  lineOfSightMin: 0,
  obstructionMax: 1,
  maxLinearSpeedMps: 1000,
  maxBodyAngularSpeedRadps: 1000,
  stabilityDurationTicks: asElapsedTicks(0),
  attemptPolicy: { retryable: true },
};

const CAMERA_SNAPSHOT: CameraSnapshot = {
  worldPose: { position: { x: 0, y: 5, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
  projection: {
    verticalFovDegrees: 90,
    aspectRatio: 16 / 9,
    nearMeters: 0.1,
    farMeters: 500,
    projectionModelVersion: '1.0.0',
  },
};

function activeObjective(attemptNumber: number): ActivePhotographyObjective {
  return {
    missionObjectiveId: MISSION_OBJECTIVE_ID,
    displayName: null,
    photographyObjectiveId: String(OBJECTIVE_ID),
    definition: TEST_OBJECTIVE,
    index: 0,
    attemptNumber,
  };
}

function flightSnapshot(
  overrides: Partial<AuthoritativeFlightStepSnapshot> = {},
): AuthoritativeFlightStepSnapshot {
  return {
    simulationTick: 10,
    fixedStepSeconds: 1 / 120,
    sessionGeneration: 1,
    pose: CAMERA_SNAPSHOT.worldPose,
    linearVelocity: { x: 0, y: 0, z: 0 },
    bodyAngularVelocity: { pitch: 0, yaw: 0, roll: 0 },
    armed: true,
    crashed: false,
    altitudeMeters: 5,
    speedMps: 0,
    aircraftId: 'test-aircraft',
    aircraftSourceType: 'factory',
    definitionVersion: null,
    physicsProfileVersion: null,
    collisionOutcome: 'none',
    runtimeCompatibilityVersion: '1',
    ...overrides,
  };
}

function observation(overrides: Partial<MissionRuntimeObservation> = {}): MissionRuntimeObservation {
  return {
    flight: flightSnapshot(),
    camera: CAMERA_SNAPSHOT,
    missionElapsedTicks: 10,
    ...overrides,
  };
}

function fixtureEvidence(evidenceId: string): PhotoCaptureEvidence {
  return {
    identity: {
      evidenceId: asPhotoCaptureEvidenceId(evidenceId),
      objectiveId: OBJECTIVE_ID,
      missionAttemptId: 'session-1',
      attemptNumber: 1,
      capturedAtTick: asSimulationTick(10),
      schemaVersion: '1.0.0',
    },
    aircraftSnapshot: {
      aircraftId: 'test-aircraft',
      pose: CAMERA_SNAPSHOT.worldPose,
      linearVelocityMps: { x: 0, y: 0, z: 0 },
      bodyAngularVelocityRadps: { x: 0, y: 0, z: 0 },
      altitudeMeters: 5,
      armed: true,
      crashed: false,
    },
    cameraSnapshot: {
      worldPose: CAMERA_SNAPSHOT.worldPose,
      projection: CAMERA_SNAPSHOT.projection,
      cameraMode: 'fpv',
      cosmeticEffectsExcluded: true,
    },
    spatialContext: { lineOfSightRatio: 1, obstructionRatio: 0 },
    subjectObservations: [],
    stability: {
      stableDurationTicks: asElapsedTicks(0),
      requiredDurationTicks: asElapsedTicks(0),
      isStable: true,
    },
  };
}

function passingEvidenceResult(): PhotoEvidenceBuildResult {
  return { ok: true, evidence: fixtureEvidence('session-1:test-photo-objective:1'), evidenceId: 'session-1:test-photo-objective:1' };
}

interface Fakes {
  readonly evidenceBuilder: { build: ReturnType<typeof vi.fn> };
  readonly objectiveRuntime: {
    getActivePhotographyObjective: ReturnType<typeof vi.fn>;
    isPhotographyObjectiveCompleted: ReturnType<typeof vi.fn>;
    createObjectiveResult: ReturnType<typeof vi.fn>;
    acceptObjective: ReturnType<typeof vi.fn>;
    recordFailedAttempt: ReturnType<typeof vi.fn>;
  };
  readonly results: { attachPresentationImage: ReturnType<typeof vi.fn> };
}

function configureCoordinator(
  overrides: Partial<{
    presentationCapture: MissionPhotoPresentationCapturePort;
  }> = {},
): { coordinator: PhotoCaptureCoordinator; fakes: Fakes } {
  const fakes: Fakes = {
    evidenceBuilder: { build: vi.fn(() => passingEvidenceResult()) },
    objectiveRuntime: {
      getActivePhotographyObjective: vi.fn(() => activeObjective(1)),
      isPhotographyObjectiveCompleted: vi.fn(() => false),
      createObjectiveResult: vi.fn(() => ({
        objectiveId: MISSION_OBJECTIVE_ID,
        status: 'completed' as const,
        scorePoints: 10,
        maxPoints: 10,
        photographyEvaluationRef: 'evidence-1',
      })),
      acceptObjective: vi.fn(() => ({ ok: true as const, missionCompleted: false })),
      recordFailedAttempt: vi.fn(),
    },
    results: { attachPresentationImage: vi.fn() },
  };

  const providers = [
    { provide: PhotoEvidenceBuilder, useValue: fakes.evidenceBuilder },
    { provide: MissionObjectiveRuntime, useValue: fakes.objectiveRuntime },
    { provide: MissionResultsFacade, useValue: fakes.results },
    ...(overrides.presentationCapture
      ? [{ provide: MISSION_PHOTO_PRESENTATION_CAPTURE, useValue: overrides.presentationCapture }]
      : []),
  ];

  TestBed.configureTestingModule({ providers });
  const coordinator = TestBed.inject(PhotoCaptureCoordinator);
  return { coordinator, fakes };
}

describe('PhotoCaptureCoordinator', () => {
  it('accepts only one pending shutter at a time and does not touch attempt state before consumption', () => {
    const { coordinator, fakes } = configureCoordinator();

    const first = coordinator.requestPhotoCapture({
      sessionGeneration: 1,
      objectiveId: String(OBJECTIVE_ID),
      sessionId: 'session-1',
    });
    expect(first.accepted).toBe(true);
    expect(coordinator.hasPendingCapture()).toBe(true);

    const second = coordinator.requestPhotoCapture({
      sessionGeneration: 1,
      objectiveId: String(OBJECTIVE_ID),
      sessionId: 'session-1',
    });
    expect(second.accepted).toBe(false);
    expect(second.diagnostic?.code).toBe('PHOTO_CAPTURE_ALREADY_PENDING');

    // Still exactly one pending shutter, and no attempt/scoring calls happened yet.
    expect(coordinator.hasPendingCapture()).toBe(true);
    expect(fakes.objectiveRuntime.createObjectiveResult).not.toHaveBeenCalled();
    expect(fakes.objectiveRuntime.recordFailedAttempt).not.toHaveBeenCalled();
  });

  it('does not count an evidence-infrastructure failure as a scored attempt', () => {
    const { coordinator, fakes } = configureCoordinator();
    fakes.evidenceBuilder.build.mockReturnValue({
      ok: false,
      diagnostic: { code: 'PHOTO_CAPTURE_SPATIAL_UNAVAILABLE', message: 'unavailable' },
    } satisfies PhotoEvidenceBuildResult);

    coordinator.requestPhotoCapture({
      sessionGeneration: 1,
      objectiveId: String(OBJECTIVE_ID),
      sessionId: 'session-1',
    });

    const outcome = coordinator.onAuthoritativeObservation(observation(), {
      paused: false,
      cameraModeFpv: true,
      sessionGeneration: 1,
      locationGeneration: 1,
      sessionId: 'session-1',
      subjects: [],
      zones: [],
      stability: new PhotoStabilityWindow().snapshot(0),
      scoringPolicy: createDefaultPhotographyScoringPolicy(),
    });

    expect(outcome?.passed).toBe(false);
    expect(outcome?.diagnostic?.code).toBe('PHOTO_CAPTURE_SPATIAL_UNAVAILABLE');
    expect(fakes.objectiveRuntime.createObjectiveResult).not.toHaveBeenCalled();
    expect(fakes.objectiveRuntime.recordFailedAttempt).not.toHaveBeenCalled();
    expect(fakes.objectiveRuntime.acceptObjective).not.toHaveBeenCalled();
    // The shutter is still consumed (never left dangling) even on an infra failure.
    expect(coordinator.hasPendingCapture()).toBe(false);
  });

  it('does not invalidate a passed capture when presentation frame capture fails', async () => {
    const failingPort: MissionPhotoPresentationCapturePort = {
      capturePresentationFrame: vi.fn().mockRejectedValue(new Error('renderer unavailable')),
    };
    const { coordinator, fakes } = configureCoordinator({ presentationCapture: failingPort });

    coordinator.requestPhotoCapture({
      sessionGeneration: 1,
      objectiveId: String(OBJECTIVE_ID),
      sessionId: 'session-1',
    });

    const outcome = coordinator.onAuthoritativeObservation(observation(), {
      paused: false,
      cameraModeFpv: true,
      sessionGeneration: 1,
      locationGeneration: 1,
      sessionId: 'session-1',
      subjects: [],
      zones: [],
      stability: new PhotoStabilityWindow().snapshot(0),
      scoringPolicy: createDefaultPhotographyScoringPolicy(),
    });

    // The scored outcome is synchronous and unaffected by the async presentation step.
    expect(outcome?.passed).toBe(true);
    expect(outcome?.diagnostic).toBeNull();
    expect(fakes.objectiveRuntime.acceptObjective).toHaveBeenCalledTimes(1);

    // Let the fire-and-forget presentation capture promise settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(fakes.results.attachPresentationImage).not.toHaveBeenCalled();
    // The presentation failure is surfaced as a non-invalidating diagnostic on lastOutcome.
    expect(coordinator.lastOutcome()?.diagnostic?.code).toBe('PHOTO_PRESENTATION_CAPTURE_FAILED');
    expect(coordinator.lastOutcome()?.passed).toBe(true);
  });
});
