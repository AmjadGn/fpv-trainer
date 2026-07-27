/**
 * Deterministic Personal Best comparator.
 *
 * Order (completed results only):
 * 1. higher total mission score
 * 2. higher required-objective subtotal
 * 3. lower elapsed simulation ticks
 * 4. lexicographically smaller stable result ID
 *
 * Failed results are never eligible. Wall-clock savedAt is ignored.
 */

import type { PersistedMissionResultRecord } from './records/persisted-result';

export type PersonalBestCompareOutcome = -1 | 0 | 1;

export interface PersonalBestComparable {
  readonly resultId: string;
  readonly missionScopeKey: string;
  readonly status: 'completed' | 'failed';
  readonly totalScore: number;
  readonly requiredObjectiveSubtotal: number;
  readonly elapsedTicks: number;
}

export function toPersonalBestComparable(
  result: PersistedMissionResultRecord,
): PersonalBestComparable {
  return {
    resultId: result.resultId,
    missionScopeKey: String(result.missionScopeKey),
    status: result.status,
    totalScore: result.totalScore,
    requiredObjectiveSubtotal: result.requiredObjectiveSubtotal,
    elapsedTicks: result.elapsedTicks,
  };
}

/**
 * Returns whether `candidate` may replace `current` as Personal Best.
 * Failed candidates never win. Cross-scope comparison returns false.
 */
export function isBetterPersonalBest(
  candidate: PersonalBestComparable,
  current: PersonalBestComparable | null,
): boolean {
  if (candidate.status !== 'completed') {
    return false;
  }
  if (!current) {
    return true;
  }
  if (current.status !== 'completed') {
    return true;
  }
  if (candidate.missionScopeKey !== current.missionScopeKey) {
    return false;
  }
  return comparePersonalBest(candidate, current) < 0;
}

/**
 * Total order for completed results in the same scope.
 * Negative ⇒ `a` is better than `b` (comes first as Personal Best).
 * Returns 0 for equal records.
 *
 * Different scopes compare as 0 only when both ineligible; otherwise
 * callers should not compare across scopes.
 */
export function comparePersonalBest(
  a: PersonalBestComparable,
  b: PersonalBestComparable,
): PersonalBestCompareOutcome {
  if (a.status !== 'completed' && b.status !== 'completed') {
    return compareResultId(a.resultId, b.resultId);
  }
  if (a.status !== 'completed') {
    return 1;
  }
  if (b.status !== 'completed') {
    return -1;
  }

  if (a.totalScore !== b.totalScore) {
    return a.totalScore > b.totalScore ? -1 : 1;
  }
  if (a.requiredObjectiveSubtotal !== b.requiredObjectiveSubtotal) {
    return a.requiredObjectiveSubtotal > b.requiredObjectiveSubtotal ? -1 : 1;
  }
  if (a.elapsedTicks !== b.elapsedTicks) {
    return a.elapsedTicks < b.elapsedTicks ? -1 : 1;
  }
  return compareResultId(a.resultId, b.resultId);
}

function compareResultId(a: string, b: string): PersonalBestCompareOutcome {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** True when both completed records are equal under the Personal Best order. */
export function personalBestEqual(
  a: PersonalBestComparable,
  b: PersonalBestComparable,
): boolean {
  return comparePersonalBest(a, b) === 0;
}
