import { TestBed } from '@angular/core/testing';

import type { BoundaryShape } from '@fpv/location-domain';
import {
  PROJECTION_MODEL_VERSION,
  type CameraSnapshot,
  type Quat,
  type Vec3,
} from '@fpv/simulation-contracts';

import {
  COASTAL_RUINS_PHOTO_OBJECTIVES,
  COASTAL_RUINS_SCORING_POLICY,
  COASTAL_RUINS_SUBJECTS,
  SUBJECT_IDS,
  getCoastalRuinsSurveyMission,
} from '../../../content/locations/mediterranean-expedition-region';
import type { AuthoritativeFlightStepSnapshot } from '../../flight-runtime/models/authoritative-flight-step-snapshot';
import { UnavailableMissionSpatialQueryAdapter } from '../adapters/unavailable-mission-spatial-query.adapter';
import {
  MISSION_PHOTO_PRESENTATION_CAPTURE,
  type MissionPhotoPresentationCaptureRequest,
  type MissionPhotoPresentationCaptureResult,
} from '../ports/mission-photo-presentation-capture.port';
import type { MissionSpatialQueryPort } from '../ports/mission-spatial-query.port';
import { MISSION_SPATIAL_QUERY } from '../ports/mission-spatial-query.token';
import { authoredGraceTicksToSeconds, graceTicksFromFixedStep } from './mission-boundary-runtime';
import { MissionObjectiveRuntime } from './mission-objective-runtime.service';
import { MissionResultsFacade } from './mission-results.facade';
import {
  MissionRuntimeCoordinator,
  type MissionRuntimeObservation,
} from './mission-runtime-coordinator.service';
import { MissionSessionFacade } from './mission-session.facade';
import { PhotoCaptureCoordinator } from './photo-capture-coordinator.service';
import { PhotoEvidenceBuilder } from './photo-evidence-builder.service';
import { PhotographyMissionRuntime } from './photography-mission-runtime.service';

/**
 * Checkpoint 5 — crash and out-of-bounds failure through the live runtime.
 *
 * `checkpoint-5-bounds-crash.spec.ts` covers the pure countdown; this spec
 * covers what the orchestrator does with it: fail once, stop capture, keep
 * the grace frozen while paused, and clear the failure on retry.
 */

const MISSION = getCoastalRuinsSurveyMission();
const SESSION_ID = 'session-bounds';
const SESSION_GENERATION = 12;
const LOCATION_GENERATION = 2;
const FIXED_STEP_SECONDS = 1 / 120;

const TEST_CAMERA_RIG = {
  rigId: 'test-rig',
  rigVersion: '1.0.0',
  resolutionStrategy: 'aircraft-profile-v1',
  cameraTiltRad: 0,
  templateDerivedCamera: false,
} as const;

const CONSUME_LOCATION_ID = 'mediterranean-expedition-region';
const CONSUME_LOCATION_VERSION = '1.0.0';

const ARCH_OBJECTIVE = COASTAL_RUINS_PHOTO_OBJECTIVES[0];
const ARCH_OBJECTIVE_ID = String(ARCH_OBJECTIVE.objectiveId);
const ARCH_ANCHOR = COASTAL_RUINS_SUBJECTS.find(
  (subject) => String(subject.id) === SUBJECT_IDS.stoneSeaArch,
)!.scoringAnchor;
const STABILITY_TICKS = ARCH_OBJECTIVE.stabilityDurationTicks as unknown as number;

const INSIDE: Vec3 = { x: -12, y: 4, z: -60 };
const OUTSIDE: Vec3 = { x: 500, y: 4, z: -60 };
const BOUNDARY: BoundaryShape = {
  kind: 'aabb',
  aabb: { min: { x: -200, y: 0, z: -200 }, max: { x: 200, y: 120, z: 200 } },
};

/** 3 authored seconds at the session step rate — 360 ticks at 120 Hz. */
const GRACE_TICKS = graceTicksFromFixedStep(
  authoredGraceTicksToSeconds(
    MISSION.failurePolicy.outOfBoundsAfterGrace.graceTicks as unknown as number,
  ),
  FIXED_STEP_SECONDS,
);

function lookAtQuat(from: Vec3, to: Vec3): Quat {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  const pitch = Math.asin(dy / length);
  const yaw = Math.atan2(-dx / length, -dz / length);
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cx = Math.cos(pitch / 2);
  const sx = Math.sin(pitch / 2);
  return { x: cy * sx, y: cx * sy, z: -sy * sx, w: cy * cx };
}

const CAMERA: CameraSnapshot = {
  worldPose: { position: INSIDE, orientation: lookAtQuat(INSIDE, ARCH_ANCHOR) },
  projection: {
    verticalFovDegrees: 60,
    aspectRatio: 16 / 9,
    nearMeters: 0.1,
    farMeters: 2_000,
    projectionModelVersion: PROJECTION_MODEL_VERSION,
  },
};

interface StepOptions {
  readonly tick: number;
  readonly position?: Vec3;
  readonly crashed?: boolean;
  readonly sessionGeneration?: number;
}

function observation(options: StepOptions): MissionRuntimeObservation {
  const flight: AuthoritativeFlightStepSnapshot = {
    simulationTick: options.tick,
    fixedStepSeconds: FIXED_STEP_SECONDS,
    sessionGeneration: options.sessionGeneration ?? SESSION_GENERATION,
    pose: {
      position: options.position ?? INSIDE,
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    },
    linearVelocity: { x: 0.05, y: 0, z: 0 },
    bodyAngularVelocity: { pitch: 0.01, yaw: 0.01, roll: 0 },
    armed: true,
    crashed: options.crashed ?? false,
    altitudeMeters: 4,
    speedMps: 0.05,
    aircraftId: 'aeroguard-2',
    aircraftSourceType: 'factory',
    definitionVersion: '1.0.0',
    physicsProfileVersion: '1.0.0',
    collisionOutcome: options.crashed ? 'severe' : 'none',
    runtimeCompatibilityVersion: '1.3.0-runtime-c3',
  };
  return { flight, camera: CAMERA, cameraRig: TEST_CAMERA_RIG, missionElapsedTicks: options.tick };
}

function clearSpatialQuery(): MissionSpatialQueryPort {
  return {
    isAvailable: () => true,
    queryLineOfSight: () => ({
      status: 'ok',
      unobstructed: true,
      firstHitDistanceMeters: null,
      obstructionCategory: null,
    }),
    querySegmentObstructions: () => ({
      status: 'ok',
      obstructed: false,
      firstHitDistanceMeters: null,
      obstructionCategory: null,
    }),
    queryVisibilitySamples: (query) => {
      const totalSampleCount = query.samplePointsWorld.length;
      return {
        status: 'ok',
        visibleFraction: 1,
        visibleSampleCount: totalSampleCount,
        totalSampleCount,
        sampleCount: totalSampleCount,
      };
    },
  };
}

class RecordingPresentationCapture {
  readonly requests: MissionPhotoPresentationCaptureRequest[] = [];

  capturePresentationFrame(
    request: MissionPhotoPresentationCaptureRequest,
  ): MissionPhotoPresentationCaptureResult {
    this.requests.push(request);
    return { ok: true, objectUrl: `blob:${request.captureId}` };
  }
}

interface Harness {
  readonly runtime: PhotographyMissionRuntime;
  readonly objectives: MissionObjectiveRuntime;
  readonly results: MissionResultsFacade;
  readonly presentation: RecordingPresentationCapture;
  step(options: StepOptions): void;
}

function setup(): Harness {
  const presentation = new RecordingPresentationCapture();
  const listeners: Array<(observed: MissionRuntimeObservation) => void> = [];

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      PhotographyMissionRuntime,
      PhotoCaptureCoordinator,
      PhotoEvidenceBuilder,
      MissionObjectiveRuntime,
      MissionResultsFacade,
      UnavailableMissionSpatialQueryAdapter,
      { provide: MISSION_SPATIAL_QUERY, useValue: clearSpatialQuery() },
      { provide: MISSION_PHOTO_PRESENTATION_CAPTURE, useValue: presentation },
      {
        provide: MissionRuntimeCoordinator,
        useValue: {
          addObservationListener: (listener: (observed: MissionRuntimeObservation) => void) => {
            listeners.push(listener);
          },
          clearObservationListeners: () => {
            listeners.length = 0;
          },
        },
      },
      { provide: MissionSessionFacade, useValue: { snapshot: () => ({ phase: 'active' }) } },
    ],
  });

  const runtime = TestBed.inject(PhotographyMissionRuntime);
  expect(
    runtime.begin({
      mission: MISSION,
      photographyObjectives: COASTAL_RUINS_PHOTO_OBJECTIVES,
      scoringPolicy: COASTAL_RUINS_SCORING_POLICY,
      sessionId: SESSION_ID,
      sessionGeneration: SESSION_GENERATION,
      locationGeneration: LOCATION_GENERATION,
      locationId: CONSUME_LOCATION_ID,
      locationVersion: CONSUME_LOCATION_VERSION,
      subjects: COASTAL_RUINS_SUBJECTS,
      boundaryShape: BOUNDARY,
      zones: [],
      fixedStepSeconds: FIXED_STEP_SECONDS,
    }).ok,
  ).toBe(true);

  return {
    runtime,
    objectives: TestBed.inject(MissionObjectiveRuntime),
    results: TestBed.inject(MissionResultsFacade),
    presentation,
    step: (options) => {
      const listener = listeners[0];
      expect(listener).toBeDefined();
      listener!(observation(options));
    },
  };
}

/** Emits `count` contiguous steps at the given position, returning the next tick. */
function flySteps(
  harness: Harness,
  fromTick: number,
  count: number,
  position: Vec3,
  sessionGeneration?: number,
): number {
  let tick = fromTick;
  for (let i = 0; i < count; i += 1) {
    harness.step({ tick, position, sessionGeneration });
    tick += 1;
  }
  return tick;
}

describe('Checkpoint 5 — crash and out-of-bounds failure in the mission runtime', () => {
  it('derives the authored 3 second grace as ticks of the active step rate', () => {
    const harness = setup();
    expect(MISSION.failurePolicy.outOfBoundsAfterGrace.enabled).toBe(true);
    expect(GRACE_TICKS).toBe(360);

    const state = harness.runtime.boundaryState();
    expect(state.configured).toBe(true);
    expect(state.graceSeconds).toBe(3);
    expect(state.graceTicks).toBe(GRACE_TICKS);
    expect(state.fixedStepSeconds).toBe(FIXED_STEP_SECONDS);
    expect(state.remainingSeconds).toBeCloseTo(3, 10);
  });

  it('fails the mission exactly once on a crash and prepares one result record', () => {
    const harness = setup();
    const failSpy = vi.spyOn(harness.objectives, 'failMission');

    harness.step({ tick: 1, crashed: true });
    const record = harness.objectives.resultRecordSnapshot();

    expect(failSpy).toHaveBeenCalledTimes(1);
    expect(failSpy).toHaveBeenCalledWith('AIRCRAFT_CRASHED');
    expect(record?.status).toBe('failed');
    expect(record?.failureReasonCode).toBe('AIRCRAFT_CRASHED');
    expect(harness.results.viewModel().status).toBe('failed');

    // Every later crashed step is inert: no second failure, same record.
    harness.step({ tick: 2, crashed: true });
    harness.step({ tick: 3, crashed: true });
    expect(failSpy).toHaveBeenCalledTimes(1);
    expect(harness.objectives.resultRecordSnapshot()).toBe(record);
    expect(harness.objectives.missionState()).toBe('results');

    failSpy.mockRestore();
  });

  it('disables photo capture after a crash and drops any queued shutter', () => {
    const harness = setup();
    const nextTick = flySteps(harness, 1, STABILITY_TICKS + 2, INSIDE);
    expect(harness.runtime.requestPhotoCapture().accepted).toBe(true);
    expect(harness.runtime.capturePending()).toBe(true);

    harness.step({ tick: nextTick, crashed: true });

    expect(harness.runtime.capturePending()).toBe(false);
    expect(harness.runtime.photographyObjectiveActive()).toBe(false);
    expect(harness.objectives.isPhotographyObjectiveCompleted(ARCH_OBJECTIVE_ID)).toBe(false);
    expect(harness.presentation.requests).toEqual([]);

    const ack = harness.runtime.requestPhotoCapture();
    expect(ack.accepted).toBe(false);
    expect(ack.diagnostic?.code).toBe('PHOTO_CAPTURE_NOT_ACTIVE');

    // A shutter cannot be revived by later fixed steps either.
    harness.step({ tick: nextTick + 1 });
    expect(harness.runtime.capturePending()).toBe(false);
    expect(harness.objectives.failedAttemptsFor(
      MISSION.grouping.requiredObjectiveIds[0],
    )).toEqual([]);
  });

  it('starts the grace countdown on exit and resets it on re-entry', () => {
    const harness = setup();
    harness.step({ tick: 1, position: INSIDE });
    expect(harness.runtime.boundaryState().outOfBounds).toBe(false);

    flySteps(harness, 2, 30, OUTSIDE);
    let state = harness.runtime.boundaryState();
    expect(state.outOfBounds).toBe(true);
    expect(state.continuousOutOfBoundsTicks).toBe(30);
    expect(state.remainingTicks).toBe(GRACE_TICKS - 30);
    expect(state.remainingSeconds).toBeCloseTo((GRACE_TICKS - 30) * FIXED_STEP_SECONDS, 10);

    harness.step({ tick: 32, position: INSIDE });
    state = harness.runtime.boundaryState();
    expect(state.outOfBounds).toBe(false);
    expect(state.continuousOutOfBoundsTicks).toBe(0);
    expect(state.remainingTicks).toBe(GRACE_TICKS);
    expect(harness.objectives.isActive()).toBe(true);

    // The full grace is available again after re-entry.
    flySteps(harness, 33, GRACE_TICKS, OUTSIDE);
    expect(harness.objectives.isActive()).toBe(true);
    expect(harness.runtime.boundaryState().expired).toBe(false);
  });

  it('fails with OUT_OF_BOUNDS on the first step past the full grace, and only once', () => {
    const harness = setup();
    const failSpy = vi.spyOn(harness.objectives, 'failMission');

    const nextTick = flySteps(harness, 1, GRACE_TICKS, OUTSIDE);
    expect(harness.objectives.isActive()).toBe(true);
    expect(harness.runtime.boundaryState().remainingTicks).toBe(0);
    expect(failSpy).not.toHaveBeenCalled();

    harness.step({ tick: nextTick, position: OUTSIDE });

    expect(failSpy).toHaveBeenCalledTimes(1);
    expect(failSpy).toHaveBeenCalledWith('OUT_OF_BOUNDS');
    expect(harness.objectives.isActive()).toBe(false);
    expect(harness.results.viewModel().failureReasonCode).toBe('OUT_OF_BOUNDS');
    expect(harness.results.viewModel().status).toBe('failed');

    flySteps(harness, nextTick + 1, 10, OUTSIDE);
    expect(failSpy).toHaveBeenCalledTimes(1);

    failSpy.mockRestore();
  });

  it('freezes the countdown while paused and never fails on unobserved steps', () => {
    const harness = setup();
    flySteps(harness, 1, GRACE_TICKS, OUTSIDE);
    expect(harness.runtime.boundaryState().remainingTicks).toBe(0);

    harness.runtime.setPaused(true);
    for (let tick = GRACE_TICKS + 1; tick <= GRACE_TICKS + 600; tick += 1) {
      harness.step({ tick, position: OUTSIDE });
    }
    expect(harness.runtime.boundaryState().continuousOutOfBoundsTicks).toBe(GRACE_TICKS);
    expect(harness.objectives.isActive()).toBe(true);

    // Resuming restarts the countdown: the paused steps were never observed,
    // so they read as a tick gap rather than credited grace.
    harness.runtime.setPaused(false);
    harness.step({ tick: GRACE_TICKS + 601, position: OUTSIDE });
    expect(harness.objectives.isActive()).toBe(true);
    expect(harness.runtime.boundaryState().continuousOutOfBoundsTicks).toBe(1);
  });

  it('restarts rather than credits the countdown across a tick gap', () => {
    const harness = setup();
    flySteps(harness, 1, 100, OUTSIDE);
    expect(harness.runtime.boundaryState().continuousOutOfBoundsTicks).toBe(100);

    harness.step({ tick: 5_000, position: OUTSIDE });
    expect(harness.runtime.boundaryState().continuousOutOfBoundsTicks).toBe(1);
    expect(harness.objectives.isActive()).toBe(true);
  });

  it('ignores steps from another flight session generation', () => {
    const harness = setup();
    flySteps(harness, 1, GRACE_TICKS + 5, OUTSIDE, SESSION_GENERATION + 1);

    expect(harness.runtime.boundaryState().continuousOutOfBoundsTicks).toBe(0);
    expect(harness.objectives.isActive()).toBe(true);
    expect(harness.objectives.elapsedTicks()).toBe(0);
  });

  it('clears the failure on retry: fresh grace, fresh objectives, capture re-enabled', () => {
    const harness = setup();
    const nextTick = flySteps(harness, 1, GRACE_TICKS + 1, OUTSIDE);
    expect(harness.objectives.isActive()).toBe(false);

    const retriedGeneration = SESSION_GENERATION + 1;
    expect(harness.runtime.retry(retriedGeneration).ok).toBe(true);

    expect(harness.objectives.isActive()).toBe(true);
    expect(harness.objectives.missionState()).toBe('active');
    expect(harness.objectives.presentation().failureReasonCode).toBeNull();
    expect(harness.results.viewModel().available).toBe(false);
    const state = harness.runtime.boundaryState();
    expect(state.expired).toBe(false);
    expect(state.continuousOutOfBoundsTicks).toBe(0);
    expect(state.remainingTicks).toBe(GRACE_TICKS);

    // The retried session can fly, capture, and consume its own full grace.
    const afterHold = flySteps(harness, nextTick, STABILITY_TICKS + 2, INSIDE, retriedGeneration);
    expect(harness.runtime.requestPhotoCapture().accepted).toBe(true);
    harness.step({ tick: afterHold, position: INSIDE, sessionGeneration: retriedGeneration });
    expect(harness.runtime.lastCaptureOutcome()?.passed).toBe(true);

    const failSpy = vi.spyOn(harness.objectives, 'failMission');
    const outStart = afterHold + 1;
    flySteps(harness, outStart, GRACE_TICKS, OUTSIDE, retriedGeneration);
    expect(failSpy).not.toHaveBeenCalled();
    harness.step({
      tick: outStart + GRACE_TICKS,
      position: OUTSIDE,
      sessionGeneration: retriedGeneration,
    });
    expect(failSpy).toHaveBeenCalledWith('OUT_OF_BOUNDS');

    failSpy.mockRestore();
  });
});
