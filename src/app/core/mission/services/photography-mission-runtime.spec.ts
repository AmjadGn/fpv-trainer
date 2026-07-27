import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import type { BoundaryShape } from '@fpv/location-domain';
import { createDefaultPhotographyScoringPolicy } from '@fpv/photography-domain';
import type { CameraSnapshot } from '@fpv/simulation-contracts';

import { getCoastalRuinsSurveyMission } from '../../../content/locations/mediterranean-expedition-region/missions/coastal-ruins-survey';
import { MEDITERRANEAN_LOCATION_ID, MEDITERRANEAN_PACKAGE_VERSION } from '../../../content/locations/mediterranean-expedition-region/identity';
import type { AuthoritativeFlightStepSnapshot } from '../../flight-runtime/models/authoritative-flight-step-snapshot';
import { MissionObjectiveRuntime } from './mission-objective-runtime.service';
import { MissionResultsFacade } from './mission-results.facade';
import {
  MissionRuntimeCoordinator,
  type MissionRuntimeObservation,
} from './mission-runtime-coordinator.service';
import { MissionSessionFacade } from './mission-session.facade';
import { PhotoCaptureCoordinator } from './photo-capture-coordinator.service';
import {
  PhotographyMissionRuntime,
  type PhotographyMissionRuntimeBeginInput,
} from './photography-mission-runtime.service';

/**
 * `PhotographyMissionRuntime` orchestrates real Angular collaborators, so
 * every collaborator here is a lightweight fake: only the surface this
 * runtime actually calls is implemented. `MissionBoundaryRuntime` and
 * `PhotoStabilityWindow` are exercised for real (they are plain internal
 * fields, not injected), which is what lets the pause test assert real
 * grace-countdown behavior without a Rapier/Three test harness.
 */

const MISSION = getCoastalRuinsSurveyMission();

const TEST_CAMERA_RIG = {
  rigId: 'test-rig',
  rigVersion: '1.0.0',
  resolutionStrategy: 'aircraft-profile-v1',
  cameraTiltRad: 0,
  templateDerivedCamera: false,
} as const;

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

function flightSnapshot(
  overrides: Partial<AuthoritativeFlightStepSnapshot> = {},
): AuthoritativeFlightStepSnapshot {
  return {
    simulationTick: 1,
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

function observationFixture(
  overrides: Partial<MissionRuntimeObservation> = {},
): MissionRuntimeObservation {
  return {
    flight: flightSnapshot(),
    camera: CAMERA_SNAPSHOT,
    cameraRig: TEST_CAMERA_RIG,
    missionElapsedTicks: 1,
    ...overrides,
  };
}

function beginInput(
  overrides: Partial<PhotographyMissionRuntimeBeginInput> = {},
): PhotographyMissionRuntimeBeginInput {
  return {
    mission: MISSION,
    photographyObjectives: [],
    scoringPolicy: createDefaultPhotographyScoringPolicy(),
    sessionId: 'session-1',
    sessionGeneration: 1,
    locationGeneration: 1,
    locationId: MEDITERRANEAN_LOCATION_ID,
    locationVersion: MEDITERRANEAN_PACKAGE_VERSION,
    subjects: [],
    boundaryShape: null,
    ...overrides,
  };
}

function fakeRuntimeCoordinator() {
  const listeners: Array<(obs: MissionRuntimeObservation) => void> = [];
  return {
    addObservationListener: vi.fn((listener: (obs: MissionRuntimeObservation) => void) => {
      listeners.push(listener);
    }),
    clearObservationListeners: vi.fn(() => {
      listeners.length = 0;
    }),
    listeners,
  };
}

function fakeObjectiveRuntime() {
  return {
    beginSession: vi.fn(() => ({ ok: true as const })),
    isActive: vi.fn(() => true),
    onAuthoritativeTick: vi.fn(),
    getActivePhotographyObjective: vi.fn(() => null),
    missionState: vi.fn(() => 'active' as const),
    retryFullMission: vi.fn(() => ({ ok: true as const })),
    reset: vi.fn(),
    isPhotographyObjectiveActive: vi.fn(() => false),
    failMission: vi.fn(() => true),
    completeMissionAndPrepareResults: vi.fn(() => null),
    acceptedEvaluationsSnapshot: vi.fn(() => new Map()),
    attemptCountsSnapshot: vi.fn(() => new Map()),
    presentation: signal(null),
  };
}

function fakeCaptureCoordinator() {
  return {
    reset: vi.fn(),
    hasPendingCapture: vi.fn(() => false),
    onAuthoritativeObservation: vi.fn(() => null),
    requestPhotoCapture: vi.fn(() => ({ accepted: true })),
    clearPending: vi.fn(),
    createPresentationSettlement: vi.fn((input) => ({
      sessionId: input.sessionId,
      sessionGeneration: input.sessionGeneration,
      resultId: input.resultId,
      expectedObjectiveIds: input.expectedObjectiveIds,
      waitForSettled: async () => [],
      release: vi.fn(),
    })),
    capturePending: signal(false),
    lastOutcome: signal(null),
  };
}

function setupRuntime(): {
  runtime: PhotographyMissionRuntime;
  runtimeCoordinator: ReturnType<typeof fakeRuntimeCoordinator>;
  objectiveRuntime: ReturnType<typeof fakeObjectiveRuntime>;
  captureCoordinator: ReturnType<typeof fakeCaptureCoordinator>;
  results: { setResult: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> };
} {
  const runtimeCoordinator = fakeRuntimeCoordinator();
  const objectiveRuntime = fakeObjectiveRuntime();
  const captureCoordinator = fakeCaptureCoordinator();
  const results = { clear: vi.fn(), setResult: vi.fn() };

  TestBed.configureTestingModule({
    providers: [
      { provide: MissionRuntimeCoordinator, useValue: runtimeCoordinator },
      { provide: MissionObjectiveRuntime, useValue: objectiveRuntime },
      { provide: PhotoCaptureCoordinator, useValue: captureCoordinator },
      { provide: MissionResultsFacade, useValue: results },
      { provide: MissionSessionFacade, useValue: { snapshot: vi.fn(() => ({ phase: 'active' })) } },
    ],
  });
  const runtime = TestBed.inject(PhotographyMissionRuntime);
  return { runtime, runtimeCoordinator, objectiveRuntime, captureCoordinator, results };
}

describe('PhotographyMissionRuntime', () => {
  it('attaches exactly one observation listener across begin/retry and re-attaches after exit', () => {
    const { runtime, runtimeCoordinator } = setupRuntime();

    expect(runtime.begin(beginInput()).ok).toBe(true);
    expect(runtimeCoordinator.addObservationListener).toHaveBeenCalledTimes(1);

    // A second begin() (e.g. a caller re-entering) must not duplicate the listener.
    expect(runtime.begin(beginInput()).ok).toBe(true);
    expect(runtimeCoordinator.addObservationListener).toHaveBeenCalledTimes(1);

    expect(runtime.retry(2).ok).toBe(true);
    expect(runtimeCoordinator.addObservationListener).toHaveBeenCalledTimes(1);

    runtime.exit();
    expect(runtimeCoordinator.clearObservationListeners).toHaveBeenCalledTimes(1);

    expect(runtime.begin(beginInput()).ok).toBe(true);
    expect(runtimeCoordinator.addObservationListener).toHaveBeenCalledTimes(2);
  });

  it('does not accumulate ticks or boundary grace while paused, and resumes cleanly', () => {
    const { runtime, runtimeCoordinator, objectiveRuntime } = setupRuntime();
    const shape: BoundaryShape = {
      kind: 'aabb',
      aabb: { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 50, z: 5 } },
    };
    runtime.begin(beginInput({ boundaryShape: shape }));
    const listener = runtimeCoordinator.listeners[0]!;

    runtime.setPaused(true);
    listener(
      observationFixture({
        flight: flightSnapshot({ simulationTick: 1, pose: { position: { x: 100, y: 5, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }),
      }),
    );
    expect(objectiveRuntime.onAuthoritativeTick).not.toHaveBeenCalled();
    expect(runtime.boundaryState().continuousOutOfBoundsTicks).toBe(0);

    runtime.setPaused(false);
    listener(
      observationFixture({
        flight: flightSnapshot({ simulationTick: 2, pose: { position: { x: 100, y: 5, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }),
      }),
    );
    expect(objectiveRuntime.onAuthoritativeTick).toHaveBeenCalledTimes(1);
    expect(runtime.boundaryState().outOfBounds).toBe(true);
  });

  it('derives photographyObjectiveActive from the objective runtime predicate with the current gating inputs', () => {
    const { runtime, objectiveRuntime } = setupRuntime();
    objectiveRuntime.isPhotographyObjectiveActive.mockReturnValue(true);

    runtime.begin(beginInput());
    expect(runtime.photographyObjectiveActive()).toBe(true);
    expect(objectiveRuntime.isPhotographyObjectiveActive).toHaveBeenLastCalledWith(
      false,
      true,
      'active',
    );

    objectiveRuntime.isPhotographyObjectiveActive.mockReturnValue(false);
    runtime.setPaused(true);
    expect(runtime.photographyObjectiveActive()).toBe(false);
    expect(objectiveRuntime.isPhotographyObjectiveActive).toHaveBeenLastCalledWith(
      true,
      true,
      'active',
    );

    runtime.setPaused(false);
    runtime.setCameraModeFpv(false);
    expect(objectiveRuntime.isPhotographyObjectiveActive).toHaveBeenLastCalledWith(
      false,
      false,
      'active',
    );
  });

  it('passes trusted aircraft metadata and authored objective versions into setResult', () => {
    const { runtime, runtimeCoordinator, objectiveRuntime, captureCoordinator, results } =
      setupRuntime();

    const record = {
      resultId: 'result-aircraft',
      missionId: MISSION.missionId,
      sessionId: 'session-1',
      status: 'completed' as const,
      objectiveResults: [
        {
          objectiveId: MISSION.objectives[0]!.objectiveId,
          status: 'completed' as const,
          scorePoints: 28,
          maxPoints: 29,
          photographyEvaluationRef: 'evidence-arch',
        },
      ],
      score: {
        finalScore: 28,
        maxScore: 87,
        requiredPoints: 28,
        timeBonusPoints: 0,
        normalizedScore: 28 / 87,
      },
      elapsedTicks: 100,
      failureReasonCode: null,
    };
    objectiveRuntime.completeMissionAndPrepareResults.mockReturnValue(record as never);
    objectiveRuntime.missionState.mockReturnValue('missionCompleted' as never);

    const photoObjectives = [
      {
        objectiveId: 'photo-coastal-arch-01',
        version: '2.3.4',
      },
    ];

    expect(
      runtime.begin(
        beginInput({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          photographyObjectives: photoObjectives as any,
        }),
      ).ok,
    ).toBe(true);

    const listener = runtimeCoordinator.listeners[0]!;
    listener(
      observationFixture({
        flight: flightSnapshot({
          aircraftId: 'factory-quad-01',
          aircraftSourceType: 'user-compiled',
          definitionVersion: 'def-9',
          physicsProfileVersion: 'phys-9',
          runtimeCompatibilityVersion: '1.3.0-runtime-c3',
        }),
      }),
    );

    expect(results.setResult).toHaveBeenCalledTimes(1);
    const input = results.setResult.mock.calls[0]![0];
    expect(input.aircraftContext).toEqual({
      aircraftId: 'factory-quad-01',
      aircraftSourceType: 'user-compiled',
      definitionVersion: 'def-9',
      physicsProfileVersion: 'phys-9',
      runtimeCompatibilityVersion: '1.3.0-runtime-c3',
    });
    expect(input.objectiveVersions.get(String(MISSION.objectives[0]!.objectiveId))).toBe('2.3.4');
    expect(captureCoordinator.createPresentationSettlement).toHaveBeenCalled();
    expect(input.presentationSettlement).toBeTruthy();
  });

  it('emits a diagnostic and still prepares results when trusted aircraft metadata is missing', () => {
    const { runtime, runtimeCoordinator, objectiveRuntime, results } = setupRuntime();

    objectiveRuntime.completeMissionAndPrepareResults.mockReturnValue({
      resultId: 'result-no-aircraft',
      missionId: MISSION.missionId,
      sessionId: 'session-1',
      status: 'completed',
      objectiveResults: [],
      score: {
        finalScore: 0,
        maxScore: 87,
        requiredPoints: 0,
        timeBonusPoints: 0,
        normalizedScore: 0,
      },
      elapsedTicks: 10,
      failureReasonCode: null,
    } as never);
    objectiveRuntime.missionState.mockReturnValue('missionCompleted' as never);

    expect(runtime.begin(beginInput()).ok).toBe(true);
    runtimeCoordinator.listeners[0]!(
      observationFixture({
        flight: flightSnapshot({
          aircraftId: '',
          aircraftSourceType: 'factory',
          runtimeCompatibilityVersion: '1.3.0-runtime-c3',
        }),
      }),
    );

    expect(results.setResult).toHaveBeenCalled();
    const input = results.setResult.mock.calls[0]![0];
    expect(input.aircraftContext).toBeNull();
    expect(runtime.diagnostics().some((d) => d.code === 'MISSION_PERSISTENCE_RECORD_INVALID')).toBe(
      true,
    );
  });
});
