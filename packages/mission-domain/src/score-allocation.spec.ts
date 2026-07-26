import { describe, expect, it } from 'vitest';

import { asObjectiveId } from './ids';
import {
  OBJECTIVE_SCORE_ALLOCATION_VERSION,
  allocateRequiredObjectiveMaxPoints,
  scorePointsFromNormalized,
  type ObjectiveScoreAllocationPolicy,
} from './score-allocation';
import { aggregateMissionResult } from './results';
import { asElapsedTicks } from '@fpv/simulation-contracts';

const OBJ_A = asObjectiveId('obj-a');
const OBJ_B = asObjectiveId('obj-b');
const OBJ_C = asObjectiveId('obj-c');

function equalThreeAllocation(): ObjectiveScoreAllocationPolicy {
  return {
    version: OBJECTIVE_SCORE_ALLOCATION_VERSION,
    requiredObjectiveWeights: [
      { objectiveId: OBJ_A, weight: 1 },
      { objectiveId: OBJ_B, weight: 1 },
      { objectiveId: OBJ_C, weight: 1 },
    ],
  };
}

describe('allocateRequiredObjectiveMaxPoints', () => {
  it('splits 85 across three equal weights as 29+28+28 (largest remainder, stable order)', () => {
    const result = allocateRequiredObjectiveMaxPoints({
      allocation: equalThreeAllocation(),
      maxScore: 100,
      reservedTimeBonusPoints: 15,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.availablePoints).toBe(85);
    expect(result.maxPointsByObjectiveId.get(String(OBJ_A))).toBe(29);
    expect(result.maxPointsByObjectiveId.get(String(OBJ_B))).toBe(28);
    expect(result.maxPointsByObjectiveId.get(String(OBJ_C))).toBe(28);
    const sum = [...result.maxPointsByObjectiveId.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBe(85);
  });

  it('makes three perfect photos plus max time bonus equal exactly 100', () => {
    const allocated = allocateRequiredObjectiveMaxPoints({
      allocation: equalThreeAllocation(),
      maxScore: 100,
      reservedTimeBonusPoints: 15,
    });
    expect(allocated.ok).toBe(true);
    if (!allocated.ok) {
      return;
    }

    const objectiveResults = [OBJ_A, OBJ_B, OBJ_C].map((objectiveId) => {
      const maxPoints = allocated.maxPointsByObjectiveId.get(String(objectiveId))!;
      return {
        objectiveId,
        status: 'completed' as const,
        scorePoints: scorePointsFromNormalized(1, maxPoints),
        maxPoints,
      };
    });

    const { score } = aggregateMissionResult({
      objectiveResults,
      requiredObjectiveIds: [OBJ_A, OBJ_B, OBJ_C],
      scoreAggregationPolicy: {
        requiredWeight: 1,
        optionalBonusWeight: 0,
        timeBonusEnabled: true,
        maxScore: 100,
        objectiveScoreAllocation: equalThreeAllocation(),
      },
      timePolicy: {
        hardLimitTicks: null,
        timeBonus: { maxBonusPoints: 15, targetElapsedTicks: asElapsedTicks(36_000) },
      },
      elapsedTicks: asElapsedTicks(1_000),
    });

    expect(objectiveResults.map((r) => r.scorePoints)).toEqual([29, 28, 28]);
    expect(score.requiredPoints).toBe(85);
    expect(score.timeBonusPoints).toBe(15);
    expect(score.finalScore).toBe(100);
    expect(score.maxScore).toBe(100);
  });

  it('does not silently clamp three perfect photos without time bonus to 100', () => {
    const allocated = allocateRequiredObjectiveMaxPoints({
      allocation: equalThreeAllocation(),
      maxScore: 100,
      reservedTimeBonusPoints: 15,
    });
    expect(allocated.ok).toBe(true);
    if (!allocated.ok) {
      return;
    }

    const objectiveResults = [OBJ_A, OBJ_B, OBJ_C].map((objectiveId) => {
      const maxPoints = allocated.maxPointsByObjectiveId.get(String(objectiveId))!;
      return {
        objectiveId,
        status: 'completed' as const,
        scorePoints: scorePointsFromNormalized(1, maxPoints),
        maxPoints,
      };
    });

    const { score } = aggregateMissionResult({
      objectiveResults,
      requiredObjectiveIds: [OBJ_A, OBJ_B, OBJ_C],
      scoreAggregationPolicy: {
        requiredWeight: 1,
        optionalBonusWeight: 0,
        timeBonusEnabled: true,
        maxScore: 100,
        objectiveScoreAllocation: equalThreeAllocation(),
      },
      timePolicy: {
        hardLimitTicks: null,
        timeBonus: { maxBonusPoints: 15, targetElapsedTicks: asElapsedTicks(100) },
      },
      // Elapsed beyond target → no time bonus.
      elapsedTicks: asElapsedTicks(200),
    });

    expect(score.timeBonusPoints).toBe(0);
    expect(score.requiredPoints).toBe(85);
    expect(score.finalScore).toBe(85);
  });

  it('supports unequal authored weights for a future mission', () => {
    const result = allocateRequiredObjectiveMaxPoints({
      allocation: {
        version: OBJECTIVE_SCORE_ALLOCATION_VERSION,
        requiredObjectiveWeights: [
          { objectiveId: OBJ_A, weight: 2 },
          { objectiveId: OBJ_B, weight: 1 },
        ],
      },
      maxScore: 90,
      reservedTimeBonusPoints: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.maxPointsByObjectiveId.get(String(OBJ_A))).toBe(60);
    expect(result.maxPointsByObjectiveId.get(String(OBJ_B))).toBe(30);
  });

  it('distributes remainders deterministically for identical fractional parts', () => {
    const first = allocateRequiredObjectiveMaxPoints({
      allocation: equalThreeAllocation(),
      maxScore: 100,
      reservedTimeBonusPoints: 15,
    });
    const second = allocateRequiredObjectiveMaxPoints({
      allocation: equalThreeAllocation(),
      maxScore: 100,
      reservedTimeBonusPoints: 15,
    });
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('rejects empty weights, duplicates, and non-positive weights', () => {
    expect(
      allocateRequiredObjectiveMaxPoints({
        allocation: { version: OBJECTIVE_SCORE_ALLOCATION_VERSION, requiredObjectiveWeights: [] },
        maxScore: 100,
        reservedTimeBonusPoints: 0,
      }).ok,
    ).toBe(false);

    expect(
      allocateRequiredObjectiveMaxPoints({
        allocation: {
          version: OBJECTIVE_SCORE_ALLOCATION_VERSION,
          requiredObjectiveWeights: [
            { objectiveId: OBJ_A, weight: 1 },
            { objectiveId: OBJ_A, weight: 1 },
          ],
        },
        maxScore: 100,
        reservedTimeBonusPoints: 0,
      }).ok,
    ).toBe(false);

    expect(
      allocateRequiredObjectiveMaxPoints({
        allocation: {
          version: OBJECTIVE_SCORE_ALLOCATION_VERSION,
          requiredObjectiveWeights: [{ objectiveId: OBJ_A, weight: 0 }],
        },
        maxScore: 100,
        reservedTimeBonusPoints: 0,
      }).ok,
    ).toBe(false);
  });
});

describe('scorePointsFromNormalized', () => {
  it('rounds half-up and clamps to [0, maxPoints]', () => {
    expect(scorePointsFromNormalized(1, 28)).toBe(28);
    expect(scorePointsFromNormalized(0, 28)).toBe(0);
    expect(scorePointsFromNormalized(0.5, 29)).toBe(15);
    expect(scorePointsFromNormalized(1.5, 28)).toBe(28);
    expect(scorePointsFromNormalized(-1, 28)).toBe(0);
  });
});
