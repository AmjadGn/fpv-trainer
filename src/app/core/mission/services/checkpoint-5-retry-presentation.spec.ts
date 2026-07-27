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
  MISSION_PHOTO_PRESENTATION_HEIGHT,
  MISSION_PHOTO_PRESENTATION_WIDTH,
  type MissionPhotoPresentationCapturePort,
  type MissionPhotoPresentationCaptureRequest,
  type MissionPhotoPresentationCaptureResult,
} from '../ports/mission-photo-presentation-capture.port';
import type { MissionSpatialQueryPort } from '../ports/mission-spatial-query.port';
import { MISSION_SPATIAL_QUERY } from '../ports/mission-spatial-query.token';
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
 * Checkpoint 5 — presentation frames and full-mission retry.
 *
 * Drives the real photography loop (objective runtime, capture coordinator,
 * evidence builder, results facade) from authoritative fixed steps, with only
 * the flight-step source, the session facade, and the two device-facing ports
 * faked. Scoring must never depend on the presentation image, and a retry
 * must leave no object URL, queued shutter, or scored attempt behind.
 */

const SESSION_ID = 'session-retry';
const SESSION_GENERATION = 7;
const LOCATION_GENERATION = 3;
const FIXED_STEP_SECONDS = 1 / 120;

const ARCH_OBJECTIVE = COASTAL_RUINS_PHOTO_OBJECTIVES[0];
const ARCH_OBJECTIVE_ID = String(ARCH_OBJECTIVE.objectiveId);
const ARCH_ANCHOR = COASTAL_RUINS_SUBJECTS.find(
  (subject) => String(subject.id) === SUBJECT_IDS.stoneSeaArch,
)!.scoringAnchor;
const STABILITY_TICKS = ARCH_OBJECTIVE.stabilityDurationTicks as unknown as number;

const CAMERA_POSITION: Vec3 = { x: -12, y: 4, z: -60 };
const BOUNDARY: BoundaryShape = {
  kind: 'aabb',
  aabb: { min: { x: -400, y: 0, z: -400 }, max: { x: 400, y: 200, z: 400 } },
};

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

function cameraSnapshot(): CameraSnapshot {
  return {
    worldPose: {
      position: CAMERA_POSITION,
      orientation: lookAtQuat(CAMERA_POSITION, ARCH_ANCHOR),
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
    simulationTick: 1,
    fixedStepSeconds: FIXED_STEP_SECONDS,
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
  overrides: Partial<AuthoritativeFlightStepSnapshot> = {},
): MissionRuntimeObservation {
  const flight = flightSnapshot(overrides);
  return { flight, camera: cameraSnapshot(), missionElapsedTicks: flight.simulationTick };
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
    queryVisibilitySamples: (query) => ({
      status: 'ok',
      visibleFraction: 1,
      sampleCount: query.samplePointsWorld.length,
    }),
  };
}

/** Presentation port that can either answer inline or be resolved by hand. */
class ControllablePresentationCapture implements MissionPhotoPresentationCapturePort {
  readonly requests: MissionPhotoPresentationCaptureRequest[] = [];
  ok = true;
  manual = false;
  private readonly deferred: Array<
    (result: MissionPhotoPresentationCaptureResult) => void
  > = [];

  capturePresentationFrame(
    request: MissionPhotoPresentationCaptureRequest,
  ): Promise<MissionPhotoPresentationCaptureResult> | MissionPhotoPresentationCaptureResult {
    this.requests.push(request);
    if (this.manual) {
      return new Promise<MissionPhotoPresentationCaptureResult>((resolve) => {
        this.deferred.push(resolve);
      });
    }
    return this.ok
      ? { ok: true, objectUrl: `blob:${request.captureId}` }
      : {
          ok: false,
          diagnosticCode: 'PHOTO_PRESENTATION_CAPTURE_FAILED',
          diagnosticMessage: 'stubbed presentation failure',
        };
  }

  resolvePending(result: MissionPhotoPresentationCaptureResult): void {
    const resolve = this.deferred.shift();
    expect(resolve).toBeDefined();
    resolve!(result);
  }
}

interface Harness {
  readonly runtime: PhotographyMissionRuntime;
  readonly objectives: MissionObjectiveRuntime;
  readonly results: MissionResultsFacade;
  readonly presentation: ControllablePresentationCapture;
  emit(overrides?: Partial<AuthoritativeFlightStepSnapshot>): void;
}

function setup(): Harness {
  const presentation = new ControllablePresentationCapture();
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
  const begun = runtime.begin({
    mission: getCoastalRuinsSurveyMission(),
    photographyObjectives: COASTAL_RUINS_PHOTO_OBJECTIVES,
    scoringPolicy: COASTAL_RUINS_SCORING_POLICY,
    sessionId: SESSION_ID,
    sessionGeneration: SESSION_GENERATION,
    locationGeneration: LOCATION_GENERATION,
    subjects: COASTAL_RUINS_SUBJECTS,
    boundaryShape: BOUNDARY,
    zones: [],
    fixedStepSeconds: FIXED_STEP_SECONDS,
  });
  expect(begun.ok).toBe(true);

  return {
    runtime,
    objectives: TestBed.inject(MissionObjectiveRuntime),
    results: TestBed.inject(MissionResultsFacade),
    presentation,
    emit: (overrides = {}) => {
      const listener = listeners[0];
      expect(listener).toBeDefined();
      listener!(observation(overrides));
    },
  };
}

/** Flies enough contiguous stable steps to satisfy the stability window. */
function holdSteady(harness: Harness, fromTick: number, sessionGeneration?: number): number {
  let tick = fromTick;
  for (let i = 0; i < STABILITY_TICKS + 2; i += 1) {
    harness.emit(
      sessionGeneration === undefined
        ? { simulationTick: tick }
        : { simulationTick: tick, sessionGeneration },
    );
    tick += 1;
  }
  return tick;
}

/** Holds steady, presses the shutter, and lets the next fixed step score it. */
async function captureOnce(
  harness: Harness,
  fromTick = 1,
  sessionGeneration?: number,
): Promise<number> {
  const nextTick = holdSteady(harness, fromTick, sessionGeneration);
  expect(harness.runtime.stableForCapture()).toBe(true);
  expect(harness.runtime.requestPhotoCapture().accepted).toBe(true);
  harness.emit(
    sessionGeneration === undefined
      ? { simulationTick: nextTick }
      : { simulationTick: nextTick, sessionGeneration },
  );
  // Let the fire-and-forget presentation promise settle.
  await Promise.resolve();
  await Promise.resolve();
  return nextTick + 1;
}

describe('Checkpoint 5 — presentation frames and retry', () => {
  let revokeSpy: ReturnType<typeof vi.spyOn>;
  let revoked: string[];

  beforeEach(() => {
    revoked = [];
    revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
      revoked.push(url);
    });
  });

  afterEach(() => {
    revokeSpy.mockRestore();
  });

  it('requests one 1280x720 frame from the authoritative camera snapshot, with no animation frame', async () => {
    const harness = setup();
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');

    await captureOnce(harness);

    const outcome = harness.runtime.lastCaptureOutcome();
    expect(outcome?.passed).toBe(true);
    expect(harness.presentation.requests).toHaveLength(1);
    const request = harness.presentation.requests[0]!;
    expect(request.captureId).toBe(outcome!.captureId);
    expect(request.width).toBe(MISSION_PHOTO_PRESENTATION_WIDTH);
    expect(request.height).toBe(MISSION_PHOTO_PRESENTATION_HEIGHT);
    expect(request.width).toBe(1280);
    expect(request.height).toBe(720);
    expect(request.cameraSnapshot).toEqual(cameraSnapshot());
    expect(rafSpy).not.toHaveBeenCalled();

    rafSpy.mockRestore();
  });

  it('attaches exactly one presentation image per objective and leaves the others empty', async () => {
    const harness = setup();

    await captureOnce(harness);
    const captureId = harness.runtime.lastCaptureOutcome()!.captureId!;
    const objectiveId = harness.runtime.lastCaptureOutcome()!.missionObjectiveId!;

    expect(harness.results.presentationImageUrls()).toEqual([`blob:${captureId}`]);

    // End the mission so the session-only view model is materialized.
    harness.emit({ simulationTick: 5_000, crashed: true });

    const objectives = harness.results.viewModel().objectives;
    expect(objectives).toHaveLength(3);
    expect(
      objectives.find((entry) => entry.objectiveId === objectiveId)?.presentationImageUrl,
    ).toBe(`blob:${captureId}`);
    expect(
      objectives
        .filter((entry) => entry.objectiveId !== objectiveId)
        .every((entry) => entry.presentationImageUrl === null),
    ).toBe(true);
  });

  it('keeps the accepted score intact when presentation frame capture fails', async () => {
    const harness = setup();
    harness.presentation.ok = false;

    await captureOnce(harness);

    const outcome = harness.runtime.lastCaptureOutcome()!;
    expect(outcome.evaluation?.passed).toBe(true);
    expect(harness.objectives.isPhotographyObjectiveCompleted(ARCH_OBJECTIVE_ID)).toBe(true);
    expect(harness.objectives.getActivePhotographyObjective()?.photographyObjectiveId).toBe(
      'photo-coastal-lookout-01',
    );
    // The failure is reported as a non-scoring diagnostic on the same outcome.
    expect(outcome.diagnostic?.code).toBe('PHOTO_PRESENTATION_CAPTURE_FAILED');
    expect(harness.results.presentationImageUrls()).toEqual([]);
    expect(revoked).toEqual([]);

    harness.emit({ simulationTick: 5_000, crashed: true });
    const completed = harness.results
      .viewModel()
      .objectives.find((entry) => entry.status === 'completed');
    expect(completed?.scorePoints).toBeGreaterThan(0);
    expect(completed?.presentationImageUrl).toBeNull();
  });

  it('revokes a presentation frame that resolves after a retry instead of attaching it', async () => {
    const harness = setup();
    harness.presentation.manual = true;

    await captureOnce(harness);
    expect(harness.presentation.requests).toHaveLength(1);
    const captureId = harness.presentation.requests[0]!.captureId;

    harness.emit({ simulationTick: 5_000, crashed: true });
    expect(harness.runtime.retry(SESSION_GENERATION + 1).ok).toBe(true);
    harness.presentation.resolvePending({ ok: true, objectUrl: `blob:${captureId}` });
    await Promise.resolve();
    await Promise.resolve();

    expect(revoked).toContain(`blob:${captureId}`);
    expect(harness.results.presentationImageUrls()).toEqual([]);
    expect(harness.results.viewModel().available).toBe(false);
  });

  it('retry revokes every image, clears the queue, and restarts the objective sequence', async () => {
    const harness = setup();
    await captureOnce(harness);
    const captureId = harness.runtime.lastCaptureOutcome()!.captureId!;
    expect(harness.results.presentationImageUrl(
      harness.runtime.lastCaptureOutcome()!.missionObjectiveId!,
    )).toBe(`blob:${captureId}`);

    // A shutter queued right before the mission ends must not survive the retry.
    harness.emit({ simulationTick: 2_000 });
    expect(harness.runtime.requestPhotoCapture().accepted).toBe(true);
    expect(harness.runtime.capturePending()).toBe(true);

    harness.emit({ simulationTick: 2_001, crashed: true });
    expect(harness.objectives.missionState()).toBe('results');
    expect(harness.runtime.retry(SESSION_GENERATION + 1).ok).toBe(true);

    expect(revoked).toEqual([`blob:${captureId}`]);
    expect(harness.results.presentationImageUrls()).toEqual([]);
    expect(harness.results.viewModel().available).toBe(false);
    expect(harness.runtime.capturePending()).toBe(false);
    expect(harness.runtime.lastCaptureOutcome()).toBeNull();
    expect(harness.objectives.missionState()).toBe('active');
    expect(harness.objectives.isPhotographyObjectiveCompleted(ARCH_OBJECTIVE_ID)).toBe(false);
    const active = harness.objectives.getActivePhotographyObjective();
    expect(active?.photographyObjectiveId).toBe(ARCH_OBJECTIVE_ID);
    expect(active?.attemptNumber).toBe(1);
    expect(harness.objectives.presentation().retryCount).toBe(1);
    expect(harness.runtime.boundaryState().outOfBounds).toBe(false);
    expect(harness.runtime.boundaryState().continuousOutOfBoundsTicks).toBe(0);
  });

  it('retry keeps the loaded location, so the very next capture scores again', async () => {
    const harness = setup();
    await captureOnce(harness);
    expect(harness.presentation.requests).toHaveLength(1);

    harness.emit({ simulationTick: 5_000, crashed: true });
    expect(harness.runtime.retry(SESSION_GENERATION + 1).ok).toBe(true);

    // Same subjects, same location generation: no reload, no re-configuration.
    await captureOnce(harness, 1, SESSION_GENERATION + 1);

    const outcome = harness.runtime.lastCaptureOutcome();
    expect(outcome?.passed).toBe(true);
    expect(outcome?.diagnostic).toBeNull();
    expect(outcome?.attemptNumber).toBe(1);
    expect(harness.presentation.requests).toHaveLength(2);
    // Capture ids are deterministic per session/objective/attempt, so a retry
    // that resets attempt numbering reproduces the first id — safe only
    // because every previous image and result was already released.
    expect(harness.presentation.requests[1]!.captureId).toBe(
      harness.presentation.requests[0]!.captureId,
    );
    expect(harness.results.presentationImageUrls()).toEqual([
      `blob:${harness.presentation.requests[1]!.captureId}`,
    ]);
    expect(harness.objectives.isPhotographyObjectiveCompleted(ARCH_OBJECTIVE_ID)).toBe(true);
  });

  it('exit revokes retained images and tears the session down', async () => {
    const harness = setup();
    await captureOnce(harness);
    const captureId = harness.runtime.lastCaptureOutcome()!.captureId!;

    harness.runtime.exit();

    expect(revoked).toEqual([`blob:${captureId}`]);
    expect(harness.results.viewModel().available).toBe(false);
    expect(harness.runtime.capturePending()).toBe(false);
    expect(harness.runtime.stability()).toBeNull();
    expect(harness.runtime.photographyObjectiveActive()).toBe(false);
    expect(harness.objectives.getActivePhotographyObjective()).toBeNull();
    expect(harness.runtime.requestPhotoCapture().accepted).toBe(false);
  });
});
