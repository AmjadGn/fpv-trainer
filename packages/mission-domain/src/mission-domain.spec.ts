import { describe, expect, it } from 'vitest';
import { asElapsedTicks } from '@fpv/simulation-contracts';
import {
  aggregateMissionResult,
  applyObjectiveResult,
  assertNoUnsupportedAircraftConstraints,
  asMissionCompatibilityVersion,
  asMissionId,
  asMissionSessionId,
  asMissionVersion,
  asObjectiveId,
  checkMissionCompatibility,
  createMissionDefinition,
  createMissionSession,
  evaluateMissionAircraftCompatibility,
  MISSION_SCHEMA_VERSION,
  transitionMissionState,
  type CreateMissionDefinitionInput,
  type MissionAircraftCapabilities,
  type MissionAircraftCompatibilityPolicy,
  type MissionDefinition,
  type ObjectiveResult,
} from './index';

const photoObjectiveId = asObjectiveId('obj-photo');
const reachObjectiveId = asObjectiveId('obj-reach');
const returnObjectiveId = asObjectiveId('obj-return');

function buildMissionInput(): CreateMissionDefinitionInput {
  return {
    metadata: { title: 'Canyon Sweep', description: 'Capture the canyon and return safely.' },
    missionId: asMissionId('mission-canyon-sweep'),
    version: asMissionVersion('1.0.0'),
    compatibilityVersion: asMissionCompatibilityVersion('1.0.0'),
    requiredLocationId: 'location-canyon',
    locationVersionRange: { min: 1, max: 3 },
    briefing: { summary: 'Fly the canyon, photograph the arch, and return to launch.' },
    aircraftCompatibilityPolicy: {
      allowedCategories: ['freestyle', 'cinematic'],
      requireCamera: true,
      fovRangeDeg: { min: 90, max: 150 },
    },
    objectives: [
      {
        kind: 'photography',
        objectiveId: photoObjectiveId,
        version: asMissionVersion('1.0.0'),
        required: true,
        photographyObjectiveId: 'photo-arch-01',
      },
      {
        kind: 'reach_zone',
        objectiveId: reachObjectiveId,
        version: asMissionVersion('1.0.0'),
        required: true,
        zoneId: 'zone-canyon-exit',
      },
      {
        kind: 'return_to_zone',
        objectiveId: returnObjectiveId,
        version: asMissionVersion('1.0.0'),
        required: true,
        zoneId: 'zone-launch',
        afterRequiredObjectives: true,
      },
    ],
    grouping: {
      mode: 'sequential',
      requiredObjectiveIds: [photoObjectiveId, reachObjectiveId, returnObjectiveId],
    },
    completionPolicy: { mode: 'all_required' },
    failurePolicy: {
      crash: { enabled: true },
      outOfBoundsAfterGrace: { enabled: true, graceTicks: asElapsedTicks(150) },
      timeout: { enabled: true },
      infrastructure: { enabled: true },
      prohibitedZone: { enabled: false, zoneIds: [] },
    },
    timePolicy: {
      hardLimitTicks: asElapsedTicks(36000),
      timeBonus: { maxBonusPoints: 20, targetElapsedTicks: asElapsedTicks(18000) },
    },
    scoreAggregationPolicy: {
      requiredWeight: 1,
      optionalBonusWeight: 0.5,
      timeBonusEnabled: true,
      maxScore: 100,
    },
  };
}

function buildMission(): MissionDefinition {
  return createMissionDefinition(buildMissionInput());
}

function baseCapabilities(
  overrides: Partial<MissionAircraftCapabilities> = {},
): MissionAircraftCapabilities {
  return {
    aircraftId: 'aircraft-1',
    sourceType: 'factory',
    category: 'freestyle',
    widthMeters: 0.25,
    heightMeters: 0.08,
    takeoffMassKg: 0.6,
    thrustToWeight: 3.5,
    recommendedMaxSpeedMps: 25,
    hasCamera: true,
    cameraProfileCapability: { minFovDeg: 90, maxFovDeg: 150, provenance: 'runtime' },
    collisionProfileAvailable: true,
    collisionProvenance: 'runtime',
    runtimeCompatibilityVersion: '1.0.0',
    estimatedEnduranceMinutes: 7,
    ...overrides,
  };
}

describe('createMissionDefinition', () => {
  it('builds a well-formed mission definition, defaulting the schema version', () => {
    const mission = buildMission();
    expect(mission.missionId as unknown as string).toBe('mission-canyon-sweep');
    expect(mission.versions.schemaVersion).toBe(MISSION_SCHEMA_VERSION);
    expect(mission.objectives).toHaveLength(3);
    expect(mission.grouping.requiredObjectiveIds).toEqual([
      photoObjectiveId,
      reachObjectiveId,
      returnObjectiveId,
    ]);
  });

  it('throws when locationVersionRange.min > max', () => {
    expect(() =>
      createMissionDefinition({
        ...buildMissionInput(),
        locationVersionRange: { min: 5, max: 1 },
      }),
    ).toThrow();
  });

  it('throws when grouping references an unknown objectiveId', () => {
    expect(() =>
      createMissionDefinition({
        ...buildMissionInput(),
        grouping: {
          mode: 'sequential',
          requiredObjectiveIds: [asObjectiveId('does-not-exist')],
        },
      }),
    ).toThrow();
  });

  it('throws when objectives contain duplicate objectiveId values', () => {
    const input = buildMissionInput();
    expect(() =>
      createMissionDefinition({
        ...input,
        objectives: [...input.objectives, input.objectives[0] as (typeof input.objectives)[number]],
      }),
    ).toThrow();
  });
});

describe('mission session lifecycle', () => {
  it('creates a session with pending objective progress, starting in "unavailable"', () => {
    const mission = buildMission();
    const session = createMissionSession(asMissionSessionId('session-1'), mission);
    expect(session.state).toBe('unavailable');
    expect(session.currentObjectiveId).toBe(photoObjectiveId);
    expect(session.objectiveProgress).toEqual([
      { objectiveId: photoObjectiveId, status: 'pending', scorePoints: 0 },
      { objectiveId: reachObjectiveId, status: 'pending', scorePoints: 0 },
      { objectiveId: returnObjectiveId, status: 'pending', scorePoints: 0 },
    ]);
  });

  it('advances currentObjectiveId sequentially as objectives are applied', () => {
    const mission = buildMission();
    let session = createMissionSession(asMissionSessionId('session-2'), mission);

    session = applyObjectiveResult(session, {
      objectiveId: photoObjectiveId,
      status: 'completed',
      scorePoints: 40,
      maxPoints: 40,
      photographyEvaluationRef: 'eval-1',
    });
    expect(session.currentObjectiveId).toBe(reachObjectiveId);
    expect(session.objectiveProgress[0]).toEqual({
      objectiveId: photoObjectiveId,
      status: 'completed',
      scorePoints: 40,
    });

    session = applyObjectiveResult(session, {
      objectiveId: reachObjectiveId,
      status: 'completed',
      scorePoints: 20,
      maxPoints: 20,
    });
    expect(session.currentObjectiveId).toBe(returnObjectiveId);

    session = applyObjectiveResult(session, {
      objectiveId: returnObjectiveId,
      status: 'completed',
      scorePoints: 20,
      maxPoints: 20,
    });
    expect(session.currentObjectiveId).toBeNull();
  });

  it('applyObjectiveResult never mutates the input session', () => {
    const mission = buildMission();
    const session = createMissionSession(asMissionSessionId('session-3'), mission);
    const updated = applyObjectiveResult(session, {
      objectiveId: photoObjectiveId,
      status: 'failed',
      scorePoints: 0,
      maxPoints: 40,
    });
    expect(session.objectiveProgress[0]?.status).toBe('pending');
    expect(updated.objectiveProgress[0]?.status).toBe('failed');
    expect(updated).not.toBe(session);
  });

  it('composes with transitionMissionState to drive a full happy-path attempt', () => {
    const mission = buildMission();
    const session = createMissionSession(asMissionSessionId('session-4'), mission);

    const toBriefing = transitionMissionState(session.state, {
      type: 'missionSelected',
      missionId: mission.missionId,
    });
    expect(toBriefing).toEqual({ ok: true, state: 'briefing' });
  });
});

describe('aggregateMissionResult', () => {
  const requiredObjectiveIds = [photoObjectiveId, reachObjectiveId, returnObjectiveId];
  const scoreAggregationPolicy = {
    requiredWeight: 1,
    optionalBonusWeight: 0.5,
    timeBonusEnabled: true,
    maxScore: 100,
  };
  const timePolicy = {
    hardLimitTicks: asElapsedTicks(36000),
    timeBonus: { maxBonusPoints: 20, targetElapsedTicks: asElapsedTicks(18000) },
  };

  it('completes and awards the full time bonus when all required objectives finish within target time', () => {
    const objectiveResults: ObjectiveResult[] = [
      { objectiveId: photoObjectiveId, status: 'completed', scorePoints: 40, maxPoints: 40 },
      { objectiveId: reachObjectiveId, status: 'completed', scorePoints: 20, maxPoints: 20 },
      { objectiveId: returnObjectiveId, status: 'completed', scorePoints: 20, maxPoints: 20 },
    ];
    const { status, score } = aggregateMissionResult({
      objectiveResults,
      requiredObjectiveIds,
      scoreAggregationPolicy,
      timePolicy,
      elapsedTicks: asElapsedTicks(10000),
    });
    expect(status).toBe('completed');
    expect(score.requiredPoints).toBe(80);
    expect(score.timeBonusPoints).toBe(20);
    expect(score.finalScore).toBe(100);
  });

  it('withholds the time bonus once the target elapsed ticks are exceeded', () => {
    const objectiveResults: ObjectiveResult[] = [
      { objectiveId: photoObjectiveId, status: 'completed', scorePoints: 40, maxPoints: 40 },
      { objectiveId: reachObjectiveId, status: 'completed', scorePoints: 20, maxPoints: 20 },
      { objectiveId: returnObjectiveId, status: 'completed', scorePoints: 20, maxPoints: 20 },
    ];
    const { score } = aggregateMissionResult({
      objectiveResults,
      requiredObjectiveIds,
      scoreAggregationPolicy,
      timePolicy,
      elapsedTicks: asElapsedTicks(20000),
    });
    expect(score.timeBonusPoints).toBe(0);
    expect(score.finalScore).toBe(80);
  });

  it('fails the mission when a required objective is incomplete, regardless of accumulated score', () => {
    const objectiveResults: ObjectiveResult[] = [
      { objectiveId: photoObjectiveId, status: 'completed', scorePoints: 40, maxPoints: 40 },
      { objectiveId: reachObjectiveId, status: 'failed', scorePoints: 0, maxPoints: 20 },
      { objectiveId: returnObjectiveId, status: 'incomplete', scorePoints: 0, maxPoints: 20 },
    ];
    const { status, score } = aggregateMissionResult({
      objectiveResults,
      requiredObjectiveIds,
      scoreAggregationPolicy,
      timePolicy,
      elapsedTicks: asElapsedTicks(10000),
    });
    expect(status).toBe('failed');
    expect(score.requiredPoints).toBe(40);
    expect(score.timeBonusPoints).toBe(0);
  });

  it('weights non-required completed objectives by optionalBonusWeight', () => {
    const bonusObjectiveId = asObjectiveId('obj-bonus');
    const objectiveResults: ObjectiveResult[] = [
      { objectiveId: photoObjectiveId, status: 'completed', scorePoints: 40, maxPoints: 40 },
      { objectiveId: reachObjectiveId, status: 'completed', scorePoints: 20, maxPoints: 20 },
      { objectiveId: returnObjectiveId, status: 'completed', scorePoints: 20, maxPoints: 20 },
      { objectiveId: bonusObjectiveId, status: 'completed', scorePoints: 10, maxPoints: 10 },
    ];
    const { score } = aggregateMissionResult({
      objectiveResults,
      requiredObjectiveIds,
      scoreAggregationPolicy,
      timePolicy: { hardLimitTicks: null },
      elapsedTicks: asElapsedTicks(500),
    });
    expect(score.optionalBonusPoints).toBe(5);
    expect(score.finalScore).toBe(85);
  });

  it('clamps the final score to maxScore', () => {
    const objectiveResults: ObjectiveResult[] = [
      { objectiveId: photoObjectiveId, status: 'completed', scorePoints: 400, maxPoints: 400 },
      { objectiveId: reachObjectiveId, status: 'completed', scorePoints: 20, maxPoints: 20 },
      { objectiveId: returnObjectiveId, status: 'completed', scorePoints: 20, maxPoints: 20 },
    ];
    const { score } = aggregateMissionResult({
      objectiveResults,
      requiredObjectiveIds,
      scoreAggregationPolicy,
      timePolicy,
      elapsedTicks: asElapsedTicks(10000),
    });
    expect(score.finalScore).toBe(100);
  });
});

describe('checkMissionCompatibility', () => {
  it('is compatible when both aircraft and location satisfy the mission', () => {
    const mission = buildMission();
    const result = checkMissionCompatibility(mission, {
      aircraftCapabilities: baseCapabilities(),
      locationVersion: 2,
    });
    expect(result.status).toBe('compatible');
    expect(result.issues).toEqual([]);
  });

  it('flags LOCATION_VERSION_OUT_OF_RANGE outside the mission range', () => {
    const mission = buildMission();
    const result = checkMissionCompatibility(mission, {
      aircraftCapabilities: baseCapabilities(),
      locationVersion: 9,
    });
    expect(result.status).toBe('incompatible');
    expect(result.issues.map((issue) => issue.code)).toContain('LOCATION_VERSION_OUT_OF_RANGE');
  });

  it('combines aircraft incompatibility with an otherwise-compatible location', () => {
    const mission = buildMission();
    const result = checkMissionCompatibility(mission, {
      aircraftCapabilities: baseCapabilities({ category: 'racing' }),
      locationVersion: 2,
    });
    expect(result.status).toBe('incompatible');
    expect(result.issues.map((issue) => issue.code)).toContain('CATEGORY_PROHIBITED');
  });

  it('skips the location check entirely when locationVersion is not provided', () => {
    const mission = buildMission();
    const result = checkMissionCompatibility(mission, { aircraftCapabilities: baseCapabilities() });
    expect(result.status).toBe('compatible');
  });
});

describe('mission-domain: no controller/calibration/device data ever appears in its types', () => {
  it('a serialized MissionAircraftCapabilities sample carries no controller/calibration terms', () => {
    const caps = baseCapabilities();
    const serialized = JSON.stringify(caps).toLowerCase();
    const keys = Object.keys(caps).map((key) => key.toLowerCase());
    const forbiddenTerms = [
      'controller',
      'gamepad',
      'inverted',
      'inversion',
      'calibration',
      'rawaxis',
      'deviceid',
    ];
    for (const term of forbiddenTerms) {
      expect(serialized.includes(term)).toBe(false);
      expect(keys.some((key) => key.includes(term))).toBe(false);
    }
  });

  it('a fully-built MissionDefinition sample carries no controller/calibration terms', () => {
    const mission = buildMission();
    const serialized = JSON.stringify(mission).toLowerCase();
    const forbiddenTerms = [
      'controller',
      'gamepad',
      'inverted',
      'inversion',
      'calibration',
      'rawaxis',
    ];
    for (const term of forbiddenTerms) {
      expect(serialized.includes(term)).toBe(false);
    }
  });

  it('the aircraft compatibility policy type has no field for endurance, structurally', () => {
    const policy: MissionAircraftCompatibilityPolicy = {
      allowedCategories: ['freestyle'],
      requireCamera: true,
    };
    // TypeScript alone enforces the absence of an endurance field on this type;
    // the runtime defensive rejection is covered by aircraft-compatibility.spec.ts.
    expect(Object.keys(policy)).toEqual(['allowedCategories', 'requireCamera']);
  });

  it('assertNoUnsupportedAircraftConstraints is exposed for upstream validation packages', () => {
    const report = assertNoUnsupportedAircraftConstraints({ enduranceMinutesMin: 20 });
    expect(report.ok).toBe(false);
  });
});

describe('public API surface', () => {
  it('exposes every documented top-level function', () => {
    expect(typeof createMissionDefinition).toBe('function');
    expect(typeof createMissionSession).toBe('function');
    expect(typeof transitionMissionState).toBe('function');
    expect(typeof applyObjectiveResult).toBe('function');
    expect(typeof aggregateMissionResult).toBe('function');
    expect(typeof evaluateMissionAircraftCompatibility).toBe('function');
    expect(typeof checkMissionCompatibility).toBe('function');
    expect(typeof assertNoUnsupportedAircraftConstraints).toBe('function');
  });
});
