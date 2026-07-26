/**
 * Authored objective score allocation for mission aggregation.
 *
 * Photography evaluations produce a normalized score in [0, 1]. Mission
 * authority maps that into an authored per-objective point budget derived
 * from `ScoreAggregationPolicy.objectiveScoreAllocation` — never from a
 * hidden equal-split of "three objectives" inside application services.
 *
 * Integer rounding policy (largest-remainder / Hamilton):
 * 1. `availablePoints = maxScore - reservedTimeBonusPoints`
 * 2. For each weight: `exact = availablePoints * weight / sum(weights)`
 * 3. Assign `floor(exact)` to each objective
 * 4. Distribute the leftover `availablePoints - sum(floors)` as +1 point
 *    each, preferring the largest fractional part; ties break by stable
 *    authored weight order (earlier entries win)
 *
 * Guarantees:
 * - Sum of allocated max points equals `availablePoints` exactly
 * - Three perfect required captures + max time bonus can reach `maxScore`
 * - Perfect captures without the time bonus do not silently clamp to max
 * - Mission final score is still clamped by `aggregateMissionResult`
 */

import type { ObjectiveId } from './ids';

/** Versioned allocation schema for required-objective point budgets. */
export const OBJECTIVE_SCORE_ALLOCATION_VERSION = '1.0.0' as const;

export interface ObjectiveScoreWeight {
  readonly objectiveId: ObjectiveId;
  /** Positive relative weight. Equal weights ⇒ equal shares after rounding. */
  readonly weight: number;
}

/**
 * Explicit, authored allocation of the required-points budget across
 * required objectives. Optional/bonus objectives are outside this map —
 * they use their own `ObjectiveResult.maxPoints` and the optional weight.
 */
export interface ObjectiveScoreAllocationPolicy {
  readonly version: typeof OBJECTIVE_SCORE_ALLOCATION_VERSION;
  /**
   * Authored weights in stable order. Every required objective that can
   * contribute mission points must appear exactly once.
   */
  readonly requiredObjectiveWeights: readonly ObjectiveScoreWeight[];
}

export interface AllocateObjectiveMaxPointsInput {
  readonly allocation: ObjectiveScoreAllocationPolicy;
  readonly maxScore: number;
  /** Points reserved for the time bonus (0 when time bonus is disabled). */
  readonly reservedTimeBonusPoints: number;
}

export type AllocateObjectiveMaxPointsResult =
  | {
      readonly ok: true;
      /** Parallel to `requiredObjectiveWeights`, sum equals available points. */
      readonly maxPointsByObjectiveId: ReadonlyMap<string, number>;
      readonly availablePoints: number;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Derives integer max-point contributions for each authored required
 * objective weight. See module doc for the rounding policy.
 */
export function allocateRequiredObjectiveMaxPoints(
  input: AllocateObjectiveMaxPointsInput,
): AllocateObjectiveMaxPointsResult {
  const { allocation, maxScore, reservedTimeBonusPoints } = input;

  if (allocation.version !== OBJECTIVE_SCORE_ALLOCATION_VERSION) {
    return {
      ok: false,
      reason: `Unsupported objective score allocation version "${allocation.version}"`,
    };
  }
  if (!Number.isFinite(maxScore) || maxScore < 0 || !Number.isInteger(maxScore)) {
    return { ok: false, reason: 'maxScore must be a non-negative integer' };
  }
  if (
    !Number.isFinite(reservedTimeBonusPoints) ||
    reservedTimeBonusPoints < 0 ||
    !Number.isInteger(reservedTimeBonusPoints)
  ) {
    return { ok: false, reason: 'reservedTimeBonusPoints must be a non-negative integer' };
  }
  if (reservedTimeBonusPoints > maxScore) {
    return { ok: false, reason: 'reservedTimeBonusPoints cannot exceed maxScore' };
  }

  const weights = allocation.requiredObjectiveWeights;
  if (weights.length === 0) {
    return { ok: false, reason: 'requiredObjectiveWeights must not be empty' };
  }

  const seen = new Set<string>();
  let totalWeight = 0;
  for (const entry of weights) {
    const id = String(entry.objectiveId);
    if (seen.has(id)) {
      return { ok: false, reason: `Duplicate objectiveId in allocation: "${id}"` };
    }
    seen.add(id);
    if (!(Number.isFinite(entry.weight) && entry.weight > 0)) {
      return { ok: false, reason: `Weight for "${id}" must be a finite positive number` };
    }
    totalWeight += entry.weight;
  }

  const availablePoints = maxScore - reservedTimeBonusPoints;
  const exactShares = weights.map((entry) => ({
    objectiveId: String(entry.objectiveId),
    exact: (availablePoints * entry.weight) / totalWeight,
  }));

  const floors = exactShares.map((share) => Math.floor(share.exact));
  let remainder = availablePoints - floors.reduce((sum, value) => sum + value, 0);

  // Largest fractional part first; ties keep authored order (stable index).
  const remainderOrder = exactShares
    .map((share, index) => ({
      index,
      fraction: share.exact - floors[index]!,
    }))
    .sort((a, b) => {
      if (b.fraction !== a.fraction) {
        return b.fraction - a.fraction;
      }
      return a.index - b.index;
    });

  const allocated = [...floors];
  for (const entry of remainderOrder) {
    if (remainder <= 0) {
      break;
    }
    allocated[entry.index] = (allocated[entry.index] ?? 0) + 1;
    remainder -= 1;
  }

  const maxPointsByObjectiveId = new Map<string, number>();
  for (let i = 0; i < weights.length; i += 1) {
    maxPointsByObjectiveId.set(String(weights[i]!.objectiveId), allocated[i]!);
  }

  return { ok: true, maxPointsByObjectiveId, availablePoints };
}

/**
 * Scales a photography evaluation's normalized score [0, 1] into the
 * authored integer point contribution for one objective.
 *
 * Rounding: `Math.round(normalizedScore * maxPoints)`, then clamped to
 * `[0, maxPoints]` so a perfect capture always yields exactly `maxPoints`
 * and a zero capture always yields 0.
 */
export function scorePointsFromNormalized(
  normalizedScore: number,
  maxPoints: number,
): number {
  if (!(Number.isFinite(normalizedScore) && Number.isFinite(maxPoints))) {
    return 0;
  }
  const clampedNormalized = Math.min(1, Math.max(0, normalizedScore));
  const clampedMax = Math.max(0, Math.trunc(maxPoints));
  return Math.min(clampedMax, Math.max(0, Math.round(clampedNormalized * clampedMax)));
}
