import { TestBed } from '@angular/core/testing';

import type { PhotographySubjectDefinition } from '@fpv/location-domain';
import {
  asPositionZoneId,
  computeNormalizedScreenRectangle,
  evaluatePhotoCapture,
  findForbiddenAircraftSnapshotKeys,
  projectSubjectBounds,
  projectSubjectSamplePoints,
  type PhotoEvaluationResult,
  type PhotographyObjectiveDefinition,
} from '@fpv/photography-domain';
import {
  PROJECTION_MODEL_VERSION,
  type CameraSnapshot,
  type Quat,
  type Vec3,
} from '@fpv/simulation-contracts';

import {
  COASTAL_RUINS_LAYOUT,
  COASTAL_RUINS_PHOTO_OBJECTIVES,
  COASTAL_RUINS_SCORING_POLICY,
  COASTAL_RUINS_SUBJECTS,
  SUBJECT_IDS,
} from '../../../content/locations/mediterranean-expedition-region';
import type { AuthoritativeFlightStepSnapshot } from '../../flight-runtime/models/authoritative-flight-step-snapshot';
import { UnavailableMissionSpatialQueryAdapter } from '../adapters/unavailable-mission-spatial-query.adapter';
import type {
  MissionLineOfSightResult,
  MissionSegmentObstructionResult,
  MissionSpatialQueryPort,
  MissionVisibilitySampleQuery,
  MissionVisibilitySampleResult,
} from '../ports/mission-spatial-query.port';
import { MISSION_SPATIAL_QUERY } from '../ports/mission-spatial-query.token';
import {
  PhotoEvidenceBuilder,
  buildCaptureId,
  toBodyAngularVelocityVec3,
  type MissionZoneShape,
  type PhotoEvidenceBuildInput,
} from './photo-evidence-builder.service';
import { PhotoStabilityWindow } from './photo-stability-window';

/**
 * Checkpoint 5 — photo evidence golden scenarios.
 *
 * Camera and aircraft poses are constructed mathematically against the
 * authored Coastal Ruins subject geometry, so each scenario isolates one
 * gate (framing, distance, viewing side, altitude, line of sight,
 * stability, position zone, spatial availability).
 */

const LOCATION_GENERATION = 5;
const SESSION_GENERATION = 11;
const SESSION_ID = 'session-cp5';

const TEST_CAMERA_RIG = {
  rigId: 'test-rig',
  rigVersion: '1.0.0',
  resolutionStrategy: 'aircraft-profile-v1',
  cameraTiltRad: 0,
  templateDerivedCamera: false,
} as const;

const ARCH_OBJECTIVE = COASTAL_RUINS_PHOTO_OBJECTIVES[0];
const LOOKOUT_OBJECTIVE = COASTAL_RUINS_PHOTO_OBJECTIVES[1];
const CLIFF_OBJECTIVE = COASTAL_RUINS_PHOTO_OBJECTIVES[2];

function subject(id: string): PhotographySubjectDefinition {
  const found = COASTAL_RUINS_SUBJECTS.find((candidate) => String(candidate.id) === id);
  if (!found) {
    throw new Error(`unknown authored subject ${id}`);
  }
  return found;
}

const ARCH = subject(SUBJECT_IDS.stoneSeaArch);
const LOOKOUT = subject(SUBJECT_IDS.ruinedLookout);
const CLIFF = subject(SUBJECT_IDS.cliffsideRuin);

// ---------------------------------------------------------------------------
// Pose / snapshot construction
// ---------------------------------------------------------------------------

/**
 * Orientation that points a camera's local -Z axis from `from` towards `to`,
 * built as yaw (about +Y) then pitch (about +X) under
 * `SIMULATOR_COORDINATE_SYSTEM_V1`.
 */
function lookAtQuat(from: Vec3, to: Vec3): Quat {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  const nx = dx / length;
  const ny = dy / length;
  const nz = dz / length;
  const pitch = Math.asin(ny);
  const yaw = Math.atan2(-nx, -nz);
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cx = Math.cos(pitch / 2);
  const sx = Math.sin(pitch / 2);
  return { x: cy * sx, y: cx * sy, z: -sy * sx, w: cy * cx };
}

function cameraAt(position: Vec3, lookAt: Vec3): CameraSnapshot {
  return {
    worldPose: { position, orientation: lookAtQuat(position, lookAt) },
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
    simulationTick: 4_200,
    fixedStepSeconds: 1 / 120,
    sessionGeneration: SESSION_GENERATION,
    pose: {
      position: { x: -12, y: 4, z: -60 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    },
    linearVelocity: { x: 0.1, y: 0, z: -0.05 },
    bodyAngularVelocity: { pitch: 0.02, yaw: 0.03, roll: 0.01 },
    armed: true,
    crashed: false,
    altitudeMeters: 4,
    speedMps: 0.112,
    aircraftId: 'aeroguard-2',
    aircraftSourceType: 'factory',
    definitionVersion: '1.0.0',
    physicsProfileVersion: '1.0.0',
    collisionOutcome: 'none',
    runtimeCompatibilityVersion: '1.3.0-runtime-c3',
    ...overrides,
  };
}

/** A real stability window run, so evidence never carries a fabricated hold. */
function stabilitySnapshot(
  objective: PhotographyObjectiveDefinition,
  stableTicks: number,
): ReturnType<PhotoStabilityWindow['snapshot']> {
  const window = new PhotoStabilityWindow();
  window.beginObjective(SESSION_GENERATION, String(objective.objectiveId), {
    maxLinearSpeedMps: objective.maxLinearSpeedMps,
    maxBodyAngularSpeedRadps: objective.maxBodyAngularSpeedRadps,
  });
  for (let tick = 0; tick < stableTicks; tick += 1) {
    window.observe(tick, 0.2, 0.05, SESSION_GENERATION, String(objective.objectiveId));
  }
  return window.snapshot(objective.stabilityDurationTicks as unknown as number);
}

// ---------------------------------------------------------------------------
// Spatial query stubs
// ---------------------------------------------------------------------------

interface StubSpatialOptions {
  readonly visibleFractionBySubject?: Readonly<Record<string, number>>;
  readonly defaultVisibleFraction?: number;
  readonly installedLocationGeneration?: number;
}

function stubSpatialQuery(options: StubSpatialOptions = {}): MissionSpatialQueryPort {
  const unavailableLos: MissionLineOfSightResult = {
    status: 'ok',
    unobstructed: true,
    firstHitDistanceMeters: null,
    obstructionCategory: null,
  };
  const segment: MissionSegmentObstructionResult = {
    status: 'ok',
    obstructed: false,
    firstHitDistanceMeters: null,
    obstructionCategory: null,
  };
  return {
    isAvailable: () => true,
    queryLineOfSight: () => unavailableLos,
    querySegmentObstructions: () => segment,
    queryVisibilitySamples: (
      query: MissionVisibilitySampleQuery,
    ): MissionVisibilitySampleResult => {
      const installed = options.installedLocationGeneration ?? LOCATION_GENERATION;
      if (
        query.expectedLocationGeneration !== undefined &&
        query.expectedLocationGeneration !== installed
      ) {
        const totalSampleCount = query.samplePointsWorld.length;
        return {
          status: 'stale-session',
          visibleFraction: null,
          visibleSampleCount: null,
          totalSampleCount,
          sampleCount: totalSampleCount,
          diagnosticCode: 'STALE_RUNTIME_SESSION',
          diagnosticMessage: 'Location runtime generation changed under the query',
        };
      }
      const subjectId = query.targetSubjectId ?? query.subjectId ?? '';
      const fraction =
        options.visibleFractionBySubject?.[subjectId] ??
        options.defaultVisibleFraction ??
        1;
      const totalSampleCount = query.samplePointsWorld.length;
      return {
        status: 'ok',
        visibleFraction: fraction,
        visibleSampleCount: Math.round(fraction * totalSampleCount),
        totalSampleCount,
        sampleCount: totalSampleCount,
      };
    },
  };
}

function builderWith(port: MissionSpatialQueryPort | null): PhotoEvidenceBuilder {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      PhotoEvidenceBuilder,
      UnavailableMissionSpatialQueryAdapter,
      ...(port ? [{ provide: MISSION_SPATIAL_QUERY, useValue: port }] : []),
    ],
  });
  return TestBed.inject(PhotoEvidenceBuilder);
}

// ---------------------------------------------------------------------------
// Scenario helper
// ---------------------------------------------------------------------------

interface ScenarioOptions {
  readonly objective?: PhotographyObjectiveDefinition;
  readonly cameraPosition: Vec3;
  readonly lookAt: Vec3;
  readonly aircraftPosition?: Vec3;
  readonly altitudeMeters?: number;
  readonly stableTicks?: number;
  readonly linearVelocity?: Vec3;
  readonly crashed?: boolean;
  readonly zones?: readonly MissionZoneShape[];
  readonly attemptNumber?: number;
}

function buildInput(options: ScenarioOptions): PhotoEvidenceBuildInput {
  const objective = options.objective ?? ARCH_OBJECTIVE;
  const camera = cameraAt(options.cameraPosition, options.lookAt);
  const flight = flightSnapshot({
    pose: {
      position: options.aircraftPosition ?? options.cameraPosition,
      orientation: camera.worldPose.orientation,
    },
    altitudeMeters: options.altitudeMeters ?? options.cameraPosition.y,
    linearVelocity: options.linearVelocity ?? { x: 0.1, y: 0, z: -0.05 },
    crashed: options.crashed ?? false,
  });
  return {
    sessionId: SESSION_ID,
    attemptNumber: options.attemptNumber ?? 1,
    missionId: 'coastal-ruins-survey',
    missionVersion: '1.0.0',
    locationId: 'mediterranean-expedition-region',
    locationVersion: '1.0.0',
    scoringPolicyVersion: COASTAL_RUINS_SCORING_POLICY.policyVersion,
    missionElapsedTicks: flight.simulationTick,
    flight,
    camera,
    cameraRig: TEST_CAMERA_RIG,
    objective,
    subjects: COASTAL_RUINS_SUBJECTS,
    stability: stabilitySnapshot(objective, options.stableTicks ?? 30),
    locationGeneration: LOCATION_GENERATION,
    sessionGeneration: SESSION_GENERATION,
    ...(options.zones ? { zones: options.zones } : {}),
  };
}

function buildOk(
  builder: PhotoEvidenceBuilder,
  options: ScenarioOptions,
): { evidence: ReturnType<typeof mustBuild>; evaluation: PhotoEvaluationResult } {
  const objective = options.objective ?? ARCH_OBJECTIVE;
  const evidence = mustBuild(builder, options);
  return {
    evidence,
    evaluation: evaluatePhotoCapture(evidence, objective, COASTAL_RUINS_SCORING_POLICY),
  };
}

function mustBuild(builder: PhotoEvidenceBuilder, options: ScenarioOptions) {
  const result = builder.build(buildInput(options));
  if (!result.ok) {
    throw new Error(`expected evidence to build, got ${result.diagnostic.code}`);
  }
  return result.evidence;
}

function failureCategories(evaluation: PhotoEvaluationResult): readonly string[] {
  return evaluation.hardFailureReasons.map((reason) => reason.split(':')[0]);
}

function componentScore(evaluation: PhotoEvaluationResult, componentId: string): number {
  return evaluation.components.find((c) => c.componentId === componentId)?.rawScore ?? -1;
}

function componentMax(evaluation: PhotoEvaluationResult, componentId: string): number {
  return evaluation.components.find((c) => c.componentId === componentId)?.maxScore ?? -1;
}

// Camera stations used by several scenarios.
const ARCH_STATION: Vec3 = { x: -12, y: 4, z: -60 };
const ARCH_OPENING_STATION: Vec3 = { x: -12, y: ARCH.scoringAnchor.y, z: -58 };
const LOOKOUT_FAR_STATION: Vec3 = { x: 28, y: 10, z: -82 };
const LOOKOUT_BEHIND_STATION: Vec3 = { x: 28, y: 10, z: 20 };
const CLIFF_STATION: Vec3 = { x: -32, y: 12, z: -20 };

describe('Checkpoint 5 — photo capture evidence golden scenarios', () => {
  it('1: a clean stone-arch capture passes every hard gate', () => {
    const builder = builderWith(stubSpatialQuery());
    const { evidence, evaluation } = buildOk(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
    });

    const observation = evidence.subjectObservations[0]!;
    expect(String(observation.subjectId)).toBe(SUBJECT_IDS.stoneSeaArch);
    expect(observation.visible).toBe(true);
    expect(observation.visibilityRatio).toBe(1);
    expect(observation.viewingSide).toBe('front');
    expect(observation.distanceMeters).toBeCloseTo(12.007, 2);
    expect(observation.viewingAngleDeg).toBeCloseTo(0, 6);
    expect(observation.centeringError).toBeCloseTo(0.02, 6);
    expect(evidence.spatialContext.lineOfSightRatio).toBe(1);
    expect(evidence.spatialContext.obstructionRatio).toBe(0);
    expect(evidence.stability.isStable).toBe(true);

    expect(evaluation.hardFailureReasons).toEqual([]);
    expect(evaluation.passed).toBe(true);
    for (const componentId of ['visibility', 'lineOfSight', 'altitude', 'positionZone', 'stability']) {
      expect(componentScore(evaluation, componentId)).toBe(
        componentMax(evaluation, componentId),
      );
    }
  });

  it('2: an arch obstructed by the tower fails visibility and line of sight', () => {
    const builder = builderWith(
      stubSpatialQuery({ defaultVisibleFraction: 0.25 }),
    );
    const { evidence, evaluation } = buildOk(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
    });

    expect(evidence.subjectObservations[0]!.visible).toBe(false);
    expect(evidence.spatialContext.lineOfSightRatio).toBe(0.25);
    expect(evidence.spatialContext.obstructionRatio).toBe(0.75);
    expect(evaluation.passed).toBe(false);
    expect(failureCategories(evaluation)).toEqual(['subjectVisibility', 'lineOfSight']);
    expect(evaluation.feedbackCodes).toContain('SUBJECT_NOT_VISIBLE');
    expect(evaluation.feedbackCodes).toContain('VIEW_OBSTRUCTED');
  });

  it('3: a clear shot through the arch opening frames the anchor on the optical centre', () => {
    const builder = builderWith(stubSpatialQuery());
    const { evidence, evaluation } = buildOk(builder, {
      cameraPosition: ARCH_OPENING_STATION,
      lookAt: ARCH.scoringAnchor,
    });

    const observation = evidence.subjectObservations[0]!;
    expect(observation.screenRectangle).not.toBeNull();
    expect(observation.screenRectangle!.minU).toBeLessThan(0.5);
    expect(observation.screenRectangle!.maxU).toBeGreaterThan(0.5);
    // Full authored AABB is larger than the opening samples, so at this
    // close station the bounds rectangle may leave the frame. That is a
    // legitimate framing-score change from the visibility-sample bugfix.
    expect(observation.frameIntersectionRatio).toBeGreaterThan(0.5);
    expect(observation.frameIntersectionRatio).toBeLessThanOrEqual(1);
    expect(observation.distanceMeters).toBeCloseTo(10, 6);
    expect(evaluation.passed).toBe(true);
    expect(componentScore(evaluation, 'framing')).toBeLessThan(
      componentMax(evaluation, 'framing'),
    );
  });

  it('4: partial sample obstruction still fails the line-of-sight gate while the subject counts as visible', () => {
    const builder = builderWith(stubSpatialQuery({ defaultVisibleFraction: 0.5 }));
    const { evidence, evaluation } = buildOk(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
    });

    // 0.5 clears visibilityMin (0.45) but not lineOfSightMin (0.6).
    expect(evidence.subjectObservations[0]!.visible).toBe(true);
    expect(evaluation.passed).toBe(false);
    expect(failureCategories(evaluation)).toEqual(['lineOfSight']);
    expect(evaluation.feedbackCodes).toContain('VIEW_OBSTRUCTED');
    expect(evaluation.feedbackCodes).not.toContain('SUBJECT_NOT_VISIBLE');
  });

  it('5: a lookout capture beyond the authored distance range fails on distance only', () => {
    const builder = builderWith(stubSpatialQuery());
    const { evidence, evaluation } = buildOk(builder, {
      objective: LOOKOUT_OBJECTIVE,
      cameraPosition: LOOKOUT_FAR_STATION,
      lookAt: LOOKOUT.scoringAnchor,
    });

    const observation = evidence.subjectObservations[0]!;
    expect(observation.distanceMeters).toBeGreaterThan(
      LOOKOUT_OBJECTIVE.cameraToSubjectDistanceRange.max,
    );
    expect(observation.viewingSide).toBe('front');
    expect(evaluation.passed).toBe(false);
    expect(failureCategories(evaluation)).toEqual(['distance']);
    expect(evaluation.feedbackCodes).toContain('MOVE_CLOSER');
  });

  it('6: a lookout capture from the back fails the viewing-side gate', () => {
    const builder = builderWith(stubSpatialQuery());
    const { evidence, evaluation } = buildOk(builder, {
      objective: LOOKOUT_OBJECTIVE,
      cameraPosition: LOOKOUT_BEHIND_STATION,
      lookAt: LOOKOUT.scoringAnchor,
    });

    const observation = evidence.subjectObservations[0]!;
    expect(observation.viewingSide).toBe('back');
    expect(LOOKOUT_OBJECTIVE.allowedViewingSides).not.toContain('back');
    expect(observation.distanceMeters).toBeLessThan(
      LOOKOUT_OBJECTIVE.cameraToSubjectDistanceRange.max,
    );
    expect(evaluation.passed).toBe(false);
    expect(failureCategories(evaluation)).toEqual(['viewingSide']);
    expect(evaluation.feedbackCodes).toContain('WRONG_VIEWING_SIDE');
  });


  it('7: a cliffside composition cropped by the frame edge is penalised, not hard-failed', () => {
    const builder = builderWith(stubSpatialQuery());
    // Yawed ~43 degrees off the anchor so the left wall falls outside the frame.
    const { evidence, evaluation } = buildOk(builder, {
      objective: CLIFF_OBJECTIVE,
      cameraPosition: CLIFF_STATION,
      lookAt: { x: CLIFF.scoringAnchor.x + 13, y: CLIFF.scoringAnchor.y, z: CLIFF.scoringAnchor.z },
    });

    const observation = evidence.subjectObservations[0]!;
    expect(observation.screenRectangle).not.toBeNull();
    expect(observation.screenRectangle!.maxU).toBeGreaterThan(1);
    expect(observation.frameIntersectionRatio).toBeGreaterThan(0);
    expect(observation.frameIntersectionRatio).toBeLessThan(1);
    expect(componentScore(evaluation, 'framing')).toBeLessThan(
      componentMax(evaluation, 'framing'),
    );

    // The authored objective sets no `screenSpaceConstraints`, so cropping
    // only costs framing points; it is not a hard failure.
    expect(CLIFF_OBJECTIVE.screenSpaceConstraints).toBeUndefined();
    expect(evaluation.hardFailureReasons).toEqual([]);
  });

  it('8: a subject behind the camera yields null screen geometry', () => {
    const builder = builderWith(stubSpatialQuery({ defaultVisibleFraction: 0 }));
    const behind: Vec3 = { x: ARCH_STATION.x, y: ARCH_STATION.y, z: ARCH_STATION.z - 10 };
    const { evidence, evaluation } = buildOk(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: behind,
    });

    const observation = evidence.subjectObservations[0]!;
    expect(observation.screenRectangle).toBeNull();
    expect(observation.centeringError).toBeNull();
    expect(observation.coverageRatio).toBeNull();
    expect(observation.frameIntersectionRatio).toBeNull();
    expect(observation.viewingAngleDeg).toBeGreaterThan(170);
    expect(evaluation.passed).toBe(false);
    expect(componentScore(evaluation, 'framing')).toBe(0);
    expect(componentScore(evaluation, 'centering')).toBe(0);
    expect(componentScore(evaluation, 'coverage')).toBe(0);
  });

  it('8b: documents that clear line of sight to a subject behind the camera is not hard-failed', () => {
    // GAP: no gate requires the subject to project inside the frame, so a
    // capture pointing away from a subject the spatial query still reports
    // as visible passes with zero framing/centering/coverage points.
    const builder = builderWith(stubSpatialQuery({ defaultVisibleFraction: 1 }));
    const behind: Vec3 = { x: ARCH_STATION.x, y: ARCH_STATION.y, z: ARCH_STATION.z - 10 };
    const { evidence, evaluation } = buildOk(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: behind,
    });

    expect(evidence.subjectObservations[0]!.screenRectangle).toBeNull();
    expect(evaluation.hardFailureReasons).toEqual([]);
    expect(evaluation.passed).toBe(true);
    expect(evaluation.normalizedScore).toBeLessThan(0.75);
  });

  it('9: the position-zone path stamps the zone only when the aircraft is inside it', () => {
    // Coastal Ruins objectives require no zone, so the builder's zone
    // evaluation is exercised with a synthetic requirement.
    for (const objective of COASTAL_RUINS_PHOTO_OBJECTIVES) {
      expect(objective.requiredAircraftPositionZoneId).toBeUndefined();
    }

    const zoneId = 'zone-sea-approach';
    const zoned: PhotographyObjectiveDefinition = {
      ...ARCH_OBJECTIVE,
      requiredAircraftPositionZoneId: asPositionZoneId(zoneId),
    };
    const zones: readonly MissionZoneShape[] = [
      {
        zoneId,
        shape: {
          kind: 'aabb',
          aabb: { min: { x: -20, y: 0, z: -70 }, max: { x: -4, y: 30, z: -50 } },
        },
      },
    ];
    const builder = builderWith(stubSpatialQuery());

    const inside = buildOk(builder, {
      objective: zoned,
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
      zones,
    });
    expect(String(inside.evidence.aircraftSnapshot.positionZoneId)).toBe(zoneId);
    expect(inside.evaluation.hardFailureReasons).toEqual([]);

    const outside = buildOk(builder, {
      objective: zoned,
      cameraPosition: ARCH_STATION,
      aircraftPosition: { x: 60, y: 4, z: -60 },
      lookAt: ARCH.scoringAnchor,
      zones,
    });
    expect(outside.evidence.aircraftSnapshot.positionZoneId).toBeUndefined();
    expect(failureCategories(outside.evaluation)).toEqual(['positionZone']);

    // A required zone whose shape was never installed behaves as "outside".
    const missingZone = buildOk(builder, {
      objective: zoned,
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
    });
    expect(missingZone.evidence.aircraftSnapshot.positionZoneId).toBeUndefined();
    expect(failureCategories(missingZone.evaluation)).toEqual(['positionZone']);
  });

  it('10: an aircraft below the authored altitude range fails with TOO_LOW', () => {
    const builder = builderWith(stubSpatialQuery());
    const { evaluation } = buildOk(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
      altitudeMeters: ARCH_OBJECTIVE.altitudeRange.minMeters - 0.5,
    });

    expect(failureCategories(evaluation)).toEqual(['altitude']);
    expect(evaluation.feedbackCodes).toContain('TOO_LOW');
    expect(componentScore(evaluation, 'altitude')).toBe(0);
  });

  it('11: an aircraft above the authored altitude range fails with TOO_HIGH', () => {
    const builder = builderWith(stubSpatialQuery());
    const { evaluation } = buildOk(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
      altitudeMeters: ARCH_OBJECTIVE.altitudeRange.maxMeters + 5,
    });

    expect(failureCategories(evaluation)).toEqual(['altitude']);
    expect(evaluation.feedbackCodes).toContain('TOO_HIGH');
  });

  it('12: an unstable aircraft fails the stability gate on hold duration and on speed', () => {
    const builder = builderWith(stubSpatialQuery());

    const shortHold = buildOk(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
      stableTicks: 10,
    });
    expect(shortHold.evidence.stability.stableDurationTicks as unknown as number).toBe(10);
    expect(shortHold.evidence.stability.isStable).toBe(false);
    expect(failureCategories(shortHold.evaluation)).toEqual(['stability']);
    expect(shortHold.evaluation.feedbackCodes).toContain('HOLD_STEADY');

    const tooFast = buildOk(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
      linearVelocity: { x: 9, y: 0, z: 0 },
    });
    expect(tooFast.evidence.stability.isStable).toBe(true);
    expect(failureCategories(tooFast.evaluation)).toEqual(['stability']);
  });

  it('13: an unavailable spatial query fails the build with PHOTO_CAPTURE_SPATIAL_UNAVAILABLE', () => {
    const builder = builderWith(null);
    const result = builder.build(
      buildInput({ cameraPosition: ARCH_STATION, lookAt: ARCH.scoringAnchor }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostic.code).toBe('PHOTO_CAPTURE_SPATIAL_UNAVAILABLE');
    expect(result.diagnostic.details?.['status']).toBe('unavailable');
    expect(result.diagnostic.details?.['spatialDiagnosticCode']).toBe(
      'SPATIAL_QUERY_UNAVAILABLE',
    );
    // Never invents clear line of sight when the infrastructure is missing.
    expect(result.diagnostic.message).toMatch(/not available/i);
  });


  it('14: a stale location generation fails the build instead of scoring stale geometry', () => {
    const builder = builderWith(
      stubSpatialQuery({ installedLocationGeneration: LOCATION_GENERATION + 1 }),
    );
    const result = builder.build(
      buildInput({ cameraPosition: ARCH_STATION, lookAt: ARCH.scoringAnchor }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostic.code).toBe('PHOTO_CAPTURE_SPATIAL_UNAVAILABLE');
    expect(result.diagnostic.details?.['status']).toBe('stale-session');
    expect(result.diagnostic.details?.['spatialDiagnosticCode']).toBe('STALE_RUNTIME_SESSION');
  });

  it('15: identical observations produce byte-identical evidence and evaluations', () => {
    const builder = builderWith(stubSpatialQuery());
    const options: ScenarioOptions = {
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
    };

    const first = buildOk(builder, options);
    for (let i = 0; i < 10; i += 1) {
      const repeat = buildOk(builder, options);
      expect(repeat.evidence).toEqual(first.evidence);
      expect(JSON.stringify(repeat.evidence)).toBe(JSON.stringify(first.evidence));
      expect(JSON.stringify(repeat.evaluation)).toBe(JSON.stringify(first.evaluation));
    }
  });

  it('fails the build when an objective references a subject the location does not contain', () => {
    const builder = builderWith(stubSpatialQuery());
    const result = builder.build({
      ...buildInput({ cameraPosition: ARCH_STATION, lookAt: ARCH.scoringAnchor }),
      subjects: COASTAL_RUINS_SUBJECTS.filter(
        (candidate) => String(candidate.id) !== SUBJECT_IDS.stoneSeaArch,
      ),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostic.code).toBe('PHOTO_CAPTURE_EVIDENCE_INVALID');
    expect(result.diagnostic.details?.['subjectId']).toBe(SUBJECT_IDS.stoneSeaArch);
  });

  it('stamps a stable capture identity and a cosmetics-free, controller-free snapshot', () => {
    const builder = builderWith(stubSpatialQuery());
    const evidence = mustBuild(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
      attemptNumber: 3,
    });

    expect(String(evidence.identity.evidenceId)).toBe(
      buildCaptureId(
        SESSION_ID,
        SESSION_GENERATION,
        String(ARCH_OBJECTIVE.objectiveId),
        3,
      ),
    );
    expect(String(evidence.identity.evidenceId)).toBe(
      `${SESSION_ID}:g${SESSION_GENERATION}:photo-coastal-arch-01:3`,
    );
    expect(evidence.identity.capturedAtTick as unknown as number).toBe(4_200);
    expect(evidence.cameraSnapshot.cosmeticEffectsExcluded).toBe(true);
    expect(evidence.cameraSnapshot.cameraMode).toBe('fpv');
    expect(
      findForbiddenAircraftSnapshotKeys(
        evidence.aircraftSnapshot as unknown as Record<string, unknown>,
      ),
    ).toEqual([]);
    expect(evidence.aircraftSnapshot.bodyAngularVelocityRadps).toEqual(
      toBodyAngularVelocityVec3({ pitch: 0.02, yaw: 0.03, roll: 0.01 }),
    );
  });

  it('fails a crashed capture regardless of framing quality', () => {
    const builder = builderWith(stubSpatialQuery());
    const { evaluation } = buildOk(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
      crashed: true,
    });

    expect(failureCategories(evaluation)).toEqual(['crashed']);
    expect(evaluation.passed).toBe(false);
  });

  it('keeps the authored playable boundary and subject anchors self-consistent', () => {
    // Guards the scenario geometry above against silent content drift.
    expect(ARCH.scoringAnchor).toEqual({
      x: COASTAL_RUINS_LAYOUT.stoneArch.position.x,
      y: COASTAL_RUINS_LAYOUT.stoneArch.openingCenterY,
      z: COASTAL_RUINS_LAYOUT.stoneArch.position.z,
    });
    expect(LOOKOUT.scoringAnchor.y).toBe(COASTAL_RUINS_LAYOUT.lookoutTower.shaftCenterY);
    expect(CLIFF.scoringAnchor.y).toBe(COASTAL_RUINS_LAYOUT.cliffsideRuin.position.y + 3);
  });

  it('frames Stone Sea Arch from authored subjectBounds, not visibility samples', () => {
    const builder = builderWith(stubSpatialQuery());
    const camera = cameraAt(ARCH_STATION, ARCH.scoringAnchor);
    const evidence = mustBuild(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
    });

    const boundsProj = projectSubjectBounds(ARCH.subjectBounds, camera);
    const sampleProj = projectSubjectSamplePoints(ARCH.visibilitySamplePoints, camera);
    expect(boundsProj.ok).toBe(true);
    expect(sampleProj.ok).toBe(true);
    if (!boundsProj.ok || !sampleProj.ok) {
      return;
    }
    const sampleRect = computeNormalizedScreenRectangle(sampleProj.value);
    expect(sampleRect.ok).toBe(true);
    if (!sampleRect.ok) {
      return;
    }

    const observation = evidence.subjectObservations[0]!;
    expect(boundsProj.value.screenRectangle).not.toEqual(sampleRect.value);
    expect(observation.screenRectangle).toEqual(boundsProj.value.screenRectangle);
    expect(observation.screenRectangle).not.toEqual(sampleRect.value);
    expect(observation.totalSampleCount).toBe(ARCH.visibilitySamplePoints.length);
    expect(observation.visibleSampleCount).toBe(ARCH.visibilitySamplePoints.length);
    expect(observation.boundsVersion).toBe(ARCH.boundsVersion);
  });

  it('frames Ruined Lookout Tower and Cliffside Ruin from authored bounds', () => {
    const builder = builderWith(stubSpatialQuery());

    for (const [subjectDef, objective, station] of [
      [LOOKOUT, LOOKOUT_OBJECTIVE, { x: 20, y: 8, z: -55 }] as const,
      [CLIFF, CLIFF_OBJECTIVE, CLIFF_STATION] as const,
    ]) {
      const camera = cameraAt(station, subjectDef.scoringAnchor);
      const evidence = mustBuild(builder, {
        objective,
        cameraPosition: station,
        lookAt: subjectDef.scoringAnchor,
      });
      const boundsProj = projectSubjectBounds(subjectDef.subjectBounds, camera);
      const sampleProj = projectSubjectSamplePoints(subjectDef.visibilitySamplePoints, camera);
      expect(boundsProj.ok).toBe(true);
      expect(sampleProj.ok).toBe(true);
      if (!boundsProj.ok || !sampleProj.ok) {
        return;
      }
      const sampleRect = computeNormalizedScreenRectangle(sampleProj.value);
      expect(sampleRect.ok).toBe(true);
      if (!sampleRect.ok) {
        return;
      }
      expect(boundsProj.value.screenRectangle).not.toEqual(sampleRect.value);
      expect(evidence.subjectObservations[0]!.screenRectangle).toEqual(
        boundsProj.value.screenRectangle,
      );
    }
  });

  it('keeps capture IDs unique across session generations and attempts', () => {
    expect(buildCaptureId('s', 1, 'obj', 1)).toBe('s:g1:obj:1');
    expect(buildCaptureId('s', 2, 'obj', 1)).toBe('s:g2:obj:1');
    expect(buildCaptureId('s', 1, 'obj', 2)).toBe('s:g1:obj:2');
    expect(buildCaptureId('s', 1, 'obj-a', 1)).not.toBe(buildCaptureId('s', 1, 'obj-b', 1));

    const builder = builderWith(stubSpatialQuery());
    const gen11 = mustBuild(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
      attemptNumber: 1,
    });
    const gen12Input = {
      ...buildInput({
        cameraPosition: ARCH_STATION,
        lookAt: ARCH.scoringAnchor,
        attemptNumber: 1,
      }),
      sessionGeneration: SESSION_GENERATION + 1,
    };
    const gen12 = builder.build(gen12Input);
    expect(gen12.ok).toBe(true);
    if (!gen12.ok) {
      return;
    }
    expect(String(gen11.identity.evidenceId)).not.toBe(String(gen12.evidence.identity.evidenceId));
    expect(gen12.evidence.identity.sessionGeneration).toBe(SESSION_GENERATION + 1);
    // Retry generation changes identity fields; scoring geometry stays aligned.
    expect(gen12.evidence.subjectObservations[0]!.screenRectangle).toEqual(
      gen11.subjectObservations[0]!.screenRectangle,
    );
  });

  it('records exact visibility sample counts and durable aircraft/camera provenance', () => {
    const builder = builderWith(stubSpatialQuery({ defaultVisibleFraction: 0.5 }));
    const evidence = mustBuild(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
    });
    const observation = evidence.subjectObservations[0]!;
    expect(observation.totalSampleCount).toBe(4);
    expect(observation.visibleSampleCount).toBe(2);
    expect(observation.visibilityRatio).toBe(0.5);
    expect(evidence.aircraftSnapshot.aircraftSourceType).toBe('factory');
    expect(evidence.aircraftSnapshot.definitionVersion).toBe('1.0.0');
    expect(evidence.aircraftSnapshot.physicsProfileVersion).toBe('1.0.0');
    expect(evidence.cameraSnapshot.rigId).toBe(TEST_CAMERA_RIG.rigId);
    expect(evidence.cameraSnapshot.resolutionStrategy).toBe(TEST_CAMERA_RIG.resolutionStrategy);
    expect(evidence.identity.missionId).toBe('coastal-ruins-survey');
    expect(evidence.identity.locationId).toBe('mediterranean-expedition-region');
    expect(evidence.identity.locationGeneration).toBe(LOCATION_GENERATION);
    expect(evidence.identity.sessionGeneration).toBe(SESSION_GENERATION);
  });

  it('is unaffected by viewport dimensions, device pixel ratio, or presentation image outcome', () => {
    const builder = builderWith(stubSpatialQuery());
    const base = mustBuild(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
    });
    // Evidence never accepts viewport/DPR inputs — rebuild with identical
    // authoritative inputs must stay byte-identical regardless of UI state.
    for (let i = 0; i < 200; i += 1) {
      const repeat = mustBuild(builder, {
        cameraPosition: ARCH_STATION,
        lookAt: ARCH.scoringAnchor,
      });
      expect(JSON.stringify(repeat)).toBe(JSON.stringify(base));
    }
    expect(base.cameraSnapshot.cosmeticEffectsExcluded).toBe(true);
    expect(
      Object.keys(base.cameraSnapshot as unknown as Record<string, unknown>),
    ).not.toContain('viewportWidth');
    expect(
      Object.keys(base.cameraSnapshot as unknown as Record<string, unknown>),
    ).not.toContain('devicePixelRatio');
  });

  it('rejects deep mutation of built evidence nested structures', () => {
    const builder = builderWith(stubSpatialQuery());
    const evidence = mustBuild(builder, {
      cameraPosition: ARCH_STATION,
      lookAt: ARCH.scoringAnchor,
    });
    expect(() => {
      (evidence.aircraftSnapshot.pose.position as { x: number }).x = 1;
    }).toThrow();
    expect(() => {
      (evidence.cameraSnapshot.worldPose.position as { y: number }).y = 1;
    }).toThrow();
    expect(() => {
      const rect = evidence.subjectObservations[0]!.screenRectangle;
      if (rect) {
        (rect as { minU: number }).minU = 0;
      }
    }).toThrow();
    expect(() => {
      (evidence.subjectObservations as unknown as unknown[]).length = 0;
    }).toThrow();
    expect(() => {
      (evidence.stability as { linearSpeedMps: number }).linearSpeedMps = 9;
    }).toThrow();
  });
});
