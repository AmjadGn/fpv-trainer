import { TestBed } from '@angular/core/testing';

import type { PhotoEvaluationResult } from '@fpv/photography-domain';
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
import type {
  MissionSpatialQueryPort,
  MissionVisibilitySampleQuery,
  MissionVisibilitySampleResult,
} from '../ports/mission-spatial-query.port';
import { MISSION_SPATIAL_QUERY } from '../ports/mission-spatial-query.token';
import {
  MISSION_PHOTO_PRESENTATION_CAPTURE,
  type MissionPhotoPresentationCaptureRequest,
  type MissionPhotoPresentationCaptureResult,
} from '../ports/mission-photo-presentation-capture.port';
import { MissionObjectiveRuntime } from './mission-objective-runtime.service';
import { MissionResultsFacade } from './mission-results.facade';
import type { MissionRuntimeObservation } from './mission-runtime-coordinator.service';
import {
  PhotoCaptureCoordinator,
  type PhotoCaptureConsumeContext,
} from './photo-capture-coordinator.service';
import { PhotoEvidenceBuilder } from './photo-evidence-builder.service';
import { PhotoStabilityWindow } from './photo-stability-window';

/**
 * Checkpoint 5 — shutter queue.
 *
 * The queue holds at most one pending shutter, consumes it on the next
 * authoritative fixed step, and never lets a queued request survive a pause,
 * a session change, or an objective change without a stable diagnostic.
 */

const SESSION_ID = 'session-shutter';
const SESSION_GENERATION = 21;
const LOCATION_GENERATION = 4;

const ARCH_OBJECTIVE_ID = String(COASTAL_RUINS_PHOTO_OBJECTIVES[0].objectiveId);
const LOOKOUT_OBJECTIVE_ID = String(COASTAL_RUINS_PHOTO_OBJECTIVES[1].objectiveId);
const ARCH_ANCHOR = COASTAL_RUINS_SUBJECTS.find(
  (subject) => String(subject.id) === SUBJECT_IDS.stoneSeaArch,
)!.scoringAnchor;

const CAMERA_POSITION: Vec3 = { x: -12, y: 4, z: -60 };

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

function cameraSnapshot(lookAt: Vec3 = ARCH_ANCHOR): CameraSnapshot {
  return {
    worldPose: {
      position: CAMERA_POSITION,
      orientation: lookAtQuat(CAMERA_POSITION, lookAt),
    },
    projection: {
      verticalFovDegrees: 60,
      aspectRatio: 16 / 9,
      nearMeters: 0.1,
      farMeters: 2_000,
      projectionModelVersion: PROJECTION_MODEL_VERSION,
    },
  };
}

function flightSnapshot(
  overrides: Partial<AuthoritativeFlightStepSnapshot> = {},
): AuthoritativeFlightStepSnapshot {
  return {
    simulationTick: 900,
    fixedStepSeconds: 1 / 120,
    sessionGeneration: SESSION_GENERATION,
    pose: { position: CAMERA_POSITION, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    linearVelocity: { x: 0.05, y: 0, z: 0 },
    bodyAngularVelocity: { pitch: 0.01, yaw: 0.01, roll: 0 },
    armed: true,
    crashed: false,
    altitudeMeters: 4,
    speedMps: 0.05,
    aircraftId: 'aeroguard-2',
    aircraftSourceType: 'factory',
    definitionVersion: '1.0.0',
    physicsProfileVersion: '1.0.0',
    collisionOutcome: 'none',
    runtimeCompatibilityVersion: '1.3.0-runtime-c3',
    ...overrides,
  };
}

function observation(
  overrides: Partial<MissionRuntimeObservation> = {},
): MissionRuntimeObservation {
  const flight = overrides.flight ?? flightSnapshot();
  return {
    flight,
    camera: overrides.camera === undefined ? cameraSnapshot() : overrides.camera,
    missionElapsedTicks: flight.simulationTick,
  };
}

function stabilityFor(objectiveId: string, ticks = 30) {
  const window = new PhotoStabilityWindow();
  window.beginObjective(SESSION_GENERATION, objectiveId, {
    maxLinearSpeedMps: 8,
    maxBodyAngularSpeedRadps: 1.8,
  });
  for (let tick = 0; tick < ticks; tick += 1) {
    window.observe(tick, 0.2, 0.05, SESSION_GENERATION, objectiveId);
  }
  return window.snapshot(24);
}

interface SpatialStubOptions {
  readonly visibleFraction?: number;
  readonly available?: boolean;
}

function spatialStub(options: SpatialStubOptions = {}): MissionSpatialQueryPort {
  return {
    isAvailable: () => options.available ?? true,
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
    queryVisibilitySamples: (
      query: MissionVisibilitySampleQuery,
    ): MissionVisibilitySampleResult =>
      options.available === false
        ? {
            status: 'unavailable',
            visibleFraction: null,
            sampleCount: query.samplePointsWorld.length,
            diagnosticCode: 'SPATIAL_QUERY_UNAVAILABLE',
            diagnosticMessage: 'stubbed unavailable',
          }
        : {
            status: 'ok',
            visibleFraction: options.visibleFraction ?? 1,
            sampleCount: query.samplePointsWorld.length,
          },
  };
}

class RecordingPresentationCapture {
  readonly requests: MissionPhotoPresentationCaptureRequest[] = [];
  ok = true;

  capturePresentationFrame(
    request: MissionPhotoPresentationCaptureRequest,
  ): MissionPhotoPresentationCaptureResult {
    this.requests.push(request);
    return this.ok
      ? { ok: true, objectUrl: `blob:${request.captureId}` }
      : {
          ok: false,
          diagnosticCode: 'PHOTO_PRESENTATION_CAPTURE_FAILED',
          diagnosticMessage: 'stubbed failure',
        };
  }
}

interface Harness {
  readonly coordinator: PhotoCaptureCoordinator;
  readonly objectives: MissionObjectiveRuntime;
  readonly results: MissionResultsFacade;
  readonly presentation: RecordingPresentationCapture;
}

function setup(spatial: MissionSpatialQueryPort = spatialStub()): Harness {
  const presentation = new RecordingPresentationCapture();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      PhotoCaptureCoordinator,
      PhotoEvidenceBuilder,
      MissionObjectiveRuntime,
      MissionResultsFacade,
      UnavailableMissionSpatialQueryAdapter,
      { provide: MISSION_SPATIAL_QUERY, useValue: spatial },
      { provide: MISSION_PHOTO_PRESENTATION_CAPTURE, useValue: presentation },
    ],
  });

  const objectives = TestBed.inject(MissionObjectiveRuntime);
  const started = objectives.beginSession({
    mission: getCoastalRuinsSurveyMission(),
    photographyObjectives: new Map(
      COASTAL_RUINS_PHOTO_OBJECTIVES.map((objective) => [
        String(objective.objectiveId),
        objective,
      ]),
    ),
    scoringPolicy: COASTAL_RUINS_SCORING_POLICY,
    sessionId: SESSION_ID,
  });
  expect(started.ok).toBe(true);

  return {
    coordinator: TestBed.inject(PhotoCaptureCoordinator),
    objectives,
    results: TestBed.inject(MissionResultsFacade),
    presentation,
  };
}

function consumeContext(
  overrides: Partial<PhotoCaptureConsumeContext> = {},
): PhotoCaptureConsumeContext {
  return {
    paused: false,
    cameraModeFpv: true,
    sessionGeneration: SESSION_GENERATION,
    locationGeneration: LOCATION_GENERATION,
    sessionId: SESSION_ID,
    subjects: COASTAL_RUINS_SUBJECTS,
    zones: [],
    stability: stabilityFor(ARCH_OBJECTIVE_ID),
    scoringPolicy: COASTAL_RUINS_SCORING_POLICY,
    ...overrides,
  };
}

/** Accepts the currently active objective with a synthetic passing evaluation. */
function acceptActiveObjective(objectives: MissionObjectiveRuntime): void {
  const active = objectives.getActivePhotographyObjective();
  expect(active).not.toBeNull();
  const evaluation: PhotoEvaluationResult = {
    scoringPolicyVersion: '1.0.0',
    passed: true,
    totalScore: 120,
    maxScore: 120,
    normalizedScore: 1,
    components: [],
    hardFailureReasons: [],
    feedbackCodes: [],
  };
  const result = objectives.createObjectiveResult(
    active!.missionObjectiveId,
    evaluation,
    'evidence-direct',
  );
  const accepted = objectives.acceptObjective(result, evaluation, {
    missionObjectiveId: active!.missionObjectiveId,
    attemptNumber: 1,
    capturedAtTick: 1,
    evidenceRef: 'evidence-direct',
  });
  expect(accepted.ok).toBe(true);
}

describe('Checkpoint 5 — photo shutter queue', () => {
  it('accepts a shutter press during an active photography objective', () => {
    const { coordinator } = setup();

    const ack = coordinator.requestPhotoCapture({
      sessionGeneration: SESSION_GENERATION,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    });

    expect(ack.accepted).toBe(true);
    expect(ack.diagnostic).toBeUndefined();
    expect(coordinator.hasPendingCapture()).toBe(true);
    expect(coordinator.capturePending()).toBe(true);
  });

  it('queues at most one shutter and reports the duplicate press', () => {
    const { coordinator } = setup();
    const request = {
      sessionGeneration: SESSION_GENERATION,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    };

    expect(coordinator.requestPhotoCapture(request).accepted).toBe(true);
    const duplicate = coordinator.requestPhotoCapture(request);

    expect(duplicate.accepted).toBe(false);
    expect(duplicate.diagnostic?.code).toBe('PHOTO_CAPTURE_ALREADY_PENDING');
    expect(coordinator.lastOutcome()?.diagnostic?.code).toBe('PHOTO_CAPTURE_ALREADY_PENDING');
    expect(coordinator.hasPendingCapture()).toBe(true);
  });

  it('consumes the pending shutter on the next authoritative tick and only once', () => {
    const { coordinator } = setup();
    coordinator.requestPhotoCapture({
      sessionGeneration: SESSION_GENERATION,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    });

    const outcome = coordinator.onAuthoritativeObservation(observation(), consumeContext());

    expect(outcome).not.toBeNull();
    expect(outcome!.captureId).toBe(`${SESSION_ID}:${ARCH_OBJECTIVE_ID}:1`);
    expect(outcome!.capturedAtTick).toBe(900);
    expect(outcome!.passed).toBe(true);
    expect(coordinator.hasPendingCapture()).toBe(false);

    expect(
      coordinator.onAuthoritativeObservation(observation(), consumeContext()),
    ).toBeNull();
  });

  it('does not consume while paused and keeps the request queued', () => {
    const { coordinator } = setup();
    coordinator.requestPhotoCapture({
      sessionGeneration: SESSION_GENERATION,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    });

    const paused = coordinator.onAuthoritativeObservation(
      observation(),
      consumeContext({ paused: true }),
    );
    expect(paused).toBeNull();
    expect(coordinator.hasPendingCapture()).toBe(true);

    const resumed = coordinator.onAuthoritativeObservation(observation(), consumeContext());
    expect(resumed?.captureId).toBe(`${SESSION_ID}:${ARCH_OBJECTIVE_ID}:1`);
  });

  it('rejects a shutter that belongs to a previous flight session', () => {
    const { coordinator } = setup();
    coordinator.requestPhotoCapture({
      sessionGeneration: SESSION_GENERATION - 1,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    });

    const outcome = coordinator.onAuthoritativeObservation(observation(), consumeContext());

    expect(outcome?.diagnostic?.code).toBe('PHOTO_CAPTURE_SESSION_STALE');
    expect(outcome?.captureId).toBeNull();
    expect(outcome?.passed).toBe(false);
    expect(coordinator.hasPendingCapture()).toBe(false);
  });

  it('rejects a shutter observed on a step from another session generation', () => {
    const { coordinator } = setup();
    coordinator.requestPhotoCapture({
      sessionGeneration: SESSION_GENERATION,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    });

    const outcome = coordinator.onAuthoritativeObservation(
      observation({ flight: flightSnapshot({ sessionGeneration: SESSION_GENERATION + 2 }) }),
      consumeContext(),
    );

    expect(outcome?.diagnostic?.code).toBe('PHOTO_CAPTURE_SESSION_STALE');
    expect(outcome?.diagnostic?.details?.['observed']).toBe(SESSION_GENERATION + 2);
  });

  it('rejects a shutter carrying a stale mission session id', () => {
    const { coordinator } = setup();
    coordinator.requestPhotoCapture({
      sessionGeneration: SESSION_GENERATION,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: 'session-from-a-previous-attempt',
    });

    const outcome = coordinator.onAuthoritativeObservation(observation(), consumeContext());
    expect(outcome?.diagnostic?.code).toBe('PHOTO_CAPTURE_SESSION_STALE');
  });

  it('rejects a request naming an objective that is not the active one', () => {
    const { coordinator } = setup();

    const ack = coordinator.requestPhotoCapture({
      sessionGeneration: SESSION_GENERATION,
      objectiveId: LOOKOUT_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    });

    expect(ack.accepted).toBe(false);
    expect(ack.diagnostic?.code).toBe('PHOTO_CAPTURE_OBJECTIVE_STALE');
    expect(ack.diagnostic?.details?.['active']).toBe(ARCH_OBJECTIVE_ID);
    expect(coordinator.hasPendingCapture()).toBe(false);
  });

  it('rejects a queued shutter when the active objective changed before consumption', () => {
    const { coordinator, objectives } = setup();
    coordinator.requestPhotoCapture({
      sessionGeneration: SESSION_GENERATION,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    });

    acceptActiveObjective(objectives);
    expect(objectives.getActivePhotographyObjective()?.photographyObjectiveId).toBe(
      LOOKOUT_OBJECTIVE_ID,
    );

    const outcome = coordinator.onAuthoritativeObservation(observation(), consumeContext());
    expect(outcome?.diagnostic?.code).toBe('PHOTO_CAPTURE_OBJECTIVE_STALE');
    expect(coordinator.hasPendingCapture()).toBe(false);
  });

  it('rejects a queued shutter for an objective that already has an accepted capture', () => {
    const { coordinator, objectives } = setup();
    coordinator.requestPhotoCapture({
      sessionGeneration: SESSION_GENERATION,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    });

    // Complete every objective so no photography objective remains active.
    acceptActiveObjective(objectives);
    acceptActiveObjective(objectives);
    acceptActiveObjective(objectives);
    expect(objectives.getActivePhotographyObjective()).toBeNull();

    const outcome = coordinator.onAuthoritativeObservation(observation(), consumeContext());
    expect(outcome?.diagnostic?.code).toBe('PHOTO_OBJECTIVE_ALREADY_COMPLETED');
  });

  it('rejects a request when no photography objective is active', () => {
    const { coordinator, objectives } = setup();
    objectives.reset();

    const ack = coordinator.requestPhotoCapture({
      sessionGeneration: SESSION_GENERATION,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    });

    expect(ack.accepted).toBe(false);
    expect(ack.diagnostic?.code).toBe('PHOTO_CAPTURE_NOT_ACTIVE');
  });

  it('rejects a queued shutter consumed outside the FPV camera mode', () => {
    const { coordinator } = setup();
    coordinator.requestPhotoCapture({
      sessionGeneration: SESSION_GENERATION,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    });

    const outcome = coordinator.onAuthoritativeObservation(
      observation(),
      consumeContext({ cameraModeFpv: false }),
    );

    expect(outcome?.diagnostic?.code).toBe('PHOTO_CAPTURE_WRONG_CAMERA_MODE');
    expect(coordinator.hasPendingCapture()).toBe(false);
  });

  it('rejects a step that carries no canonical camera snapshot', () => {
    const { coordinator } = setup();
    coordinator.requestPhotoCapture({
      sessionGeneration: SESSION_GENERATION,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    });

    const outcome = coordinator.onAuthoritativeObservation(
      observation({ camera: null }),
      consumeContext(),
    );

    expect(outcome?.diagnostic?.code).toBe('PHOTO_CAPTURE_EVIDENCE_INVALID');
  });

  it('surfaces an unavailable spatial query as a capture diagnostic, never as a pass', () => {
    const { coordinator, objectives } = setup(spatialStub({ available: false }));
    coordinator.requestPhotoCapture({
      sessionGeneration: SESSION_GENERATION,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    });

    const outcome = coordinator.onAuthoritativeObservation(observation(), consumeContext());

    expect(outcome?.diagnostic?.code).toBe('PHOTO_CAPTURE_SPATIAL_UNAVAILABLE');
    expect(outcome?.passed).toBe(false);
    expect(outcome?.evaluation).toBeNull();
    expect(objectives.getActivePhotographyObjective()?.attemptNumber).toBe(1);
  });

  it('keeps a failed capture on the same objective and increments the attempt number', () => {
    const { coordinator, objectives } = setup(spatialStub({ visibleFraction: 0.1 }));
    coordinator.requestPhotoCapture({
      sessionGeneration: SESSION_GENERATION,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    });

    const outcome = coordinator.onAuthoritativeObservation(observation(), consumeContext());

    expect(outcome?.passed).toBe(false);
    expect(outcome?.evaluation?.passed).toBe(false);
    expect(outcome?.diagnostic).toBeNull();
    const active = objectives.getActivePhotographyObjective();
    expect(active?.photographyObjectiveId).toBe(ARCH_OBJECTIVE_ID);
    expect(active?.attemptNumber).toBe(2);
    expect(objectives.failedAttemptsFor(active!.missionObjectiveId)).toHaveLength(1);
  });

  it('advances the objective and requests a 1280x720 presentation frame on a passing capture', async () => {
    const { coordinator, objectives, results, presentation } = setup();
    coordinator.requestPhotoCapture({
      sessionGeneration: SESSION_GENERATION,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    });

    const outcome = coordinator.onAuthoritativeObservation(observation(), consumeContext());
    await Promise.resolve();
    await Promise.resolve();

    expect(outcome?.passed).toBe(true);
    expect(objectives.getActivePhotographyObjective()?.photographyObjectiveId).toBe(
      LOOKOUT_OBJECTIVE_ID,
    );
    expect(presentation.requests).toHaveLength(1);
    expect(presentation.requests[0]!.width).toBe(1280);
    expect(presentation.requests[0]!.height).toBe(720);
    expect(presentation.requests[0]!.captureId).toBe(outcome!.captureId);
    expect(results.presentationImageUrl(String(outcome!.missionObjectiveId))).toBe(
      `blob:${outcome!.captureId}`,
    );
  });

  it('clears a queued shutter on clearPending and on reset', () => {
    const { coordinator } = setup();
    const request = {
      sessionGeneration: SESSION_GENERATION,
      objectiveId: ARCH_OBJECTIVE_ID,
      sessionId: SESSION_ID,
    };

    coordinator.requestPhotoCapture(request);
    coordinator.clearPending();
    expect(coordinator.hasPendingCapture()).toBe(false);
    expect(
      coordinator.onAuthoritativeObservation(observation(), consumeContext()),
    ).toBeNull();

    coordinator.requestPhotoCapture(request);
    coordinator.reset();
    expect(coordinator.hasPendingCapture()).toBe(false);
    expect(coordinator.lastOutcome()).toBeNull();
  });
});
