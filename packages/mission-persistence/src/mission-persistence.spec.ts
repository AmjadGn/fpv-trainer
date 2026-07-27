import { describe, expect, it } from 'vitest';

import {
  MISSION_PERSISTENCE_SCHEMA_VERSION,
  MISSION_RESULTS_RETENTION_LIMIT,
  applyResultToSummary,
  buildMissionScopeKey,
  comparePersonalBest,
  createEmptyMissionSummary,
  deserializeMissionResult,
  freezeMissionResult,
  isBetterPersonalBest,
  parseMissionScopeKey,
  personalBestEqual,
  planMissionResultRetention,
  serializeMissionResult,
  toPersonalBestComparable,
  validatePersistedMissionResult,
  type PersistedMissionResultRecord,
} from './index';

function makeResult(
  overrides: Partial<PersistedMissionResultRecord> &
    Pick<PersistedMissionResultRecord, 'resultId' | 'totalScore' | 'status'>,
): PersistedMissionResultRecord {
  const scope = buildMissionScopeKey({
    missionId: 'coastal-ruins-survey',
    missionVersion: '1.0.0',
    scoringPolicyVersion: '1.0.0',
  });
  return {
    persistenceSchemaVersion: MISSION_PERSISTENCE_SCHEMA_VERSION,
    missionScopeKey: scope,
    missionId: 'coastal-ruins-survey',
    missionVersion: '1.0.0',
    scoringPolicyVersion: '1.0.0',
    evidenceSchemaVersion: '2.0.0',
    sessionId: 'session-1',
    sessionGeneration: 1,
    locationId: 'mediterranean-expedition-region',
    locationVersion: '1.0.0',
    aircraftId: 'factory-demo',
    aircraftSourceType: 'factory',
    aircraftDefinitionVersion: '1.0.0',
    aircraftPhysicsProfileVersion: '1.0.0',
    aircraftRuntimeCompatibilityVersion: '1.0.0',
    failureReasonCode: null,
    maximumScore: 100,
    normalizedScore: overrides.totalScore / 100,
    requiredObjectiveSubtotal: overrides.requiredObjectiveSubtotal ?? overrides.totalScore,
    timeBonusPoints: 0,
    elapsedTicks: overrides.elapsedTicks ?? 1_000,
    fixedStepSeconds: 1 / 120,
    objectives: [],
    attemptCountTotal: 1,
    imageAvailability: [],
    savedAt: {
      savedAtEpochMs: overrides.savedAt?.savedAtEpochMs ?? 1_000,
      savedAtIso: overrides.savedAt?.savedAtIso ?? '2026-01-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

describe('mission scope key', () => {
  it('builds and parses the stable key format', () => {
    const key = buildMissionScopeKey({
      missionId: 'coastal-ruins-survey',
      missionVersion: '1.0.0',
      scoringPolicyVersion: '1.0.0',
    });
    expect(key).toBe('coastal-ruins-survey@1.0.0#1.0.0');
    expect(parseMissionScopeKey(key)).toEqual({
      missionId: 'coastal-ruins-survey',
      missionVersion: '1.0.0',
      scoringPolicyVersion: '1.0.0',
    });
  });

  it('rejects malformed keys', () => {
    expect(parseMissionScopeKey('no-delimiters')).toBeNull();
    expect(parseMissionScopeKey('a@b')).toBeNull();
    expect(parseMissionScopeKey('@1.0.0#1.0.0')).toBeNull();
  });
});

describe('DTO validation and serialization', () => {
  it('round-trips a valid result', () => {
    const result = makeResult({ resultId: 'r1', totalScore: 80, status: 'completed' });
    const json = serializeMissionResult(result);
    const parsed = deserializeMissionResult(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.resultId).toBe('r1');
      expect(parsed.value.persistenceSchemaVersion).toBe('1.0.0');
    }
  });

  it('rejects unknown schema versions', () => {
    const result = makeResult({ resultId: 'r1', totalScore: 10, status: 'failed' });
    const invalid = validatePersistedMissionResult({
      ...result,
      persistenceSchemaVersion: '9.9.9',
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.disposition).toBe('ignore');
    }
  });

  it('freezeMissionResult deep-freezes nested fields', () => {
    const frozen = freezeMissionResult(
      makeResult({ resultId: 'r1', totalScore: 1, status: 'failed' }),
    );
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.savedAt)).toBe(true);
  });
});

describe('Personal Best comparator', () => {
  it('prefers higher total score', () => {
    const a = toPersonalBestComparable(
      makeResult({ resultId: 'a', totalScore: 90, status: 'completed' }),
    );
    const b = toPersonalBestComparable(
      makeResult({ resultId: 'b', totalScore: 80, status: 'completed' }),
    );
    expect(comparePersonalBest(a, b)).toBe(-1);
    expect(isBetterPersonalBest(a, b)).toBe(true);
  });

  it('breaks ties by required-objective subtotal', () => {
    const a = toPersonalBestComparable(
      makeResult({
        resultId: 'a',
        totalScore: 80,
        requiredObjectiveSubtotal: 70,
        status: 'completed',
      }),
    );
    const b = toPersonalBestComparable(
      makeResult({
        resultId: 'b',
        totalScore: 80,
        requiredObjectiveSubtotal: 60,
        status: 'completed',
      }),
    );
    expect(comparePersonalBest(a, b)).toBe(-1);
  });

  it('breaks ties by lower elapsed ticks', () => {
    const a = toPersonalBestComparable(
      makeResult({
        resultId: 'a',
        totalScore: 80,
        requiredObjectiveSubtotal: 70,
        elapsedTicks: 500,
        status: 'completed',
      }),
    );
    const b = toPersonalBestComparable(
      makeResult({
        resultId: 'b',
        totalScore: 80,
        requiredObjectiveSubtotal: 70,
        elapsedTicks: 900,
        status: 'completed',
      }),
    );
    expect(comparePersonalBest(a, b)).toBe(-1);
  });

  it('breaks ties by lexicographically smaller result ID', () => {
    const a = toPersonalBestComparable(
      makeResult({
        resultId: 'aaa',
        totalScore: 80,
        requiredObjectiveSubtotal: 70,
        elapsedTicks: 500,
        status: 'completed',
      }),
    );
    const b = toPersonalBestComparable(
      makeResult({
        resultId: 'zzz',
        totalScore: 80,
        requiredObjectiveSubtotal: 70,
        elapsedTicks: 500,
        status: 'completed',
      }),
    );
    expect(comparePersonalBest(a, b)).toBe(-1);
    expect(personalBestEqual(a, a)).toBe(true);
  });

  it('never lets a failed result win', () => {
    const failed = toPersonalBestComparable(
      makeResult({ resultId: 'fail', totalScore: 999, status: 'failed' }),
    );
    const completed = toPersonalBestComparable(
      makeResult({ resultId: 'ok', totalScore: 10, status: 'completed' }),
    );
    expect(isBetterPersonalBest(failed, null)).toBe(false);
    expect(isBetterPersonalBest(failed, completed)).toBe(false);
    expect(comparePersonalBest(failed, completed)).toBe(1);
  });

  it('does not compare across scopes as a better best', () => {
    const a = toPersonalBestComparable(
      makeResult({ resultId: 'a', totalScore: 90, status: 'completed' }),
    );
    const otherScope = {
      ...a,
      missionScopeKey: 'other@1.0.0#1.0.0',
    };
    expect(isBetterPersonalBest(a, otherScope)).toBe(false);
  });

  it('ignores wall-clock savedAt (not part of comparable)', () => {
    const early = makeResult({
      resultId: 'a',
      totalScore: 50,
      status: 'completed',
      savedAt: { savedAtEpochMs: 1, savedAtIso: '2020-01-01T00:00:00.000Z' },
    });
    const late = makeResult({
      resultId: 'b',
      totalScore: 50,
      status: 'completed',
      savedAt: { savedAtEpochMs: 9_999_999, savedAtIso: '2030-01-01T00:00:00.000Z' },
      requiredObjectiveSubtotal: 50,
      elapsedTicks: early.elapsedTicks,
    });
    // Equal scores/subtotals/ticks → resultId decides, not savedAt.
    expect(comparePersonalBest(toPersonalBestComparable(early), toPersonalBestComparable(late))).toBe(
      -1,
    );
  });

  it('is deterministic across repeated comparisons', () => {
    const a = toPersonalBestComparable(
      makeResult({ resultId: 'a', totalScore: 70, status: 'completed' }),
    );
    const b = toPersonalBestComparable(
      makeResult({ resultId: 'b', totalScore: 60, status: 'completed' }),
    );
    for (let i = 0; i < 20; i += 1) {
      expect(comparePersonalBest(a, b)).toBe(-1);
    }
  });
});

describe('retention planner', () => {
  it(`retains at most ${MISSION_RESULTS_RETENTION_LIMIT} and pins Personal Best`, () => {
    const candidates = Array.from({ length: 25 }, (_, i) => ({
      resultId: `r-${String(i).padStart(2, '0')}`,
      savedAtEpochMs: 1_000 + i,
    }));
    const plan = planMissionResultRetention({
      candidates,
      personalBestResultId: 'r-00',
    });
    expect(plan.retainIds).toContain('r-00');
    expect(plan.retainIds.length).toBe(MISSION_RESULTS_RETENTION_LIMIT + 1);
    expect(plan.deleteIds).not.toContain('r-00');
    expect(plan.deleteIds.length).toBe(4);
  });

  it('pins Personal Best outside the recent twenty', () => {
    const candidates = Array.from({ length: 22 }, (_, i) => ({
      resultId: `id-${i}`,
      savedAtEpochMs: i,
    }));
    const plan = planMissionResultRetention({
      candidates,
      personalBestResultId: 'id-0',
      retentionLimit: 20,
    });
    expect(plan.retainIds).toContain('id-0');
    expect(plan.deleteIds).not.toContain('id-0');
  });
});

describe('summary application', () => {
  it('marks completed results as Personal Best and increments counters', () => {
    const empty = createEmptyMissionSummary(
      String(
        buildMissionScopeKey({
          missionId: 'coastal-ruins-survey',
          missionVersion: '1.0.0',
          scoringPolicyVersion: '1.0.0',
        }),
      ),
    );
    const first = applyResultToSummary(
      empty,
      makeResult({ resultId: 'r1', totalScore: 40, status: 'completed' }),
    );
    expect(first.becamePersonalBest).toBe(true);
    expect(first.summary.completionCount).toBe(1);
    expect(first.summary.personalBestResultId).toBe('r1');

    const failed = applyResultToSummary(
      first.summary,
      makeResult({ resultId: 'r2', totalScore: 99, status: 'failed' }),
    );
    expect(failed.becamePersonalBest).toBe(false);
    expect(failed.summary.personalBestResultId).toBe('r1');
    expect(failed.summary.totalAttemptCount).toBe(2);
    expect(failed.summary.completionCount).toBe(1);
  });
});
