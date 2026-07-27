/**
 * Deterministic retention planner for recent mission results.
 *
 * Keeps the latest {@link MISSION_RESULTS_RETENTION_LIMIT} results by
 * savedAtEpochMs (desc) then resultId (asc) as a stable tie-break.
 * Always pins the current Personal Best even when older than the window.
 */

import { MISSION_RESULTS_RETENTION_LIMIT } from './constants';

export interface RetentionCandidate {
  readonly resultId: string;
  readonly savedAtEpochMs: number;
}

export interface RetentionPlanInput {
  readonly candidates: readonly RetentionCandidate[];
  readonly personalBestResultId: string | null;
  readonly retentionLimit?: number;
}

export interface RetentionPlan {
  readonly retainIds: readonly string[];
  readonly deleteIds: readonly string[];
}

export function planMissionResultRetention(input: RetentionPlanInput): RetentionPlan {
  const limit = input.retentionLimit ?? MISSION_RESULTS_RETENTION_LIMIT;
  const byId = new Map<string, RetentionCandidate>();
  for (const candidate of input.candidates) {
    byId.set(candidate.resultId, candidate);
  }

  const sorted = [...byId.values()].sort((a, b) => {
    if (a.savedAtEpochMs !== b.savedAtEpochMs) {
      return b.savedAtEpochMs - a.savedAtEpochMs;
    }
    return a.resultId < b.resultId ? -1 : a.resultId > b.resultId ? 1 : 0;
  });

  const retain = new Set<string>();
  for (const entry of sorted) {
    if (retain.size >= limit) {
      break;
    }
    retain.add(entry.resultId);
  }

  const pb = input.personalBestResultId;
  if (pb && byId.has(pb)) {
    retain.add(pb);
  }

  const deleteIds: string[] = [];
  for (const id of byId.keys()) {
    if (!retain.has(id)) {
      deleteIds.push(id);
    }
  }
  deleteIds.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return {
    retainIds: [...retain].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    deleteIds,
  };
}

/** History list ordering: newest first, stable resultId tie-break. */
export function sortResultsForHistory<T extends RetentionCandidate>(
  results: readonly T[],
): T[] {
  return [...results].sort((a, b) => {
    if (a.savedAtEpochMs !== b.savedAtEpochMs) {
      return b.savedAtEpochMs - a.savedAtEpochMs;
    }
    return a.resultId < b.resultId ? -1 : a.resultId > b.resultId ? 1 : 0;
  });
}
