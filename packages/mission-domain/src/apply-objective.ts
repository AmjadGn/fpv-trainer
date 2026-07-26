/**
 * Pure application of a single objective result onto a mission session.
 */

import type { ObjectiveId } from './ids';
import type { ObjectiveResult, ObjectiveResultStatus } from './results';
import type { ObjectiveGrouping } from './objectives';
import type { MissionSessionState, ObjectiveProgress, ObjectiveProgressStatus } from './session';

function toProgressStatus(status: ObjectiveResultStatus): ObjectiveProgressStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'skipped';
    case 'incomplete':
      return 'active';
  }
}

function isSettled(status: ObjectiveProgressStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'skipped';
}

function computeNextCurrentObjectiveId(
  grouping: ObjectiveGrouping,
  progress: readonly ObjectiveProgress[],
  currentObjectiveId: ObjectiveId | null,
): ObjectiveId | null {
  if (grouping.mode !== 'sequential') {
    return currentObjectiveId;
  }
  const next = grouping.requiredObjectiveIds.find((objectiveId) => {
    const entry = progress.find((p) => p.objectiveId === objectiveId);
    return entry === undefined || !isSettled(entry.status);
  });
  return next ?? null;
}

/**
 * Applies a single objective's final result to a session, returning a new
 * `MissionSessionState` (never mutates `session`). Does not touch the
 * mission's coarse lifecycle `state` — pairing this with an
 * `objectiveCompleted` (or equivalent) FSM event is the caller's
 * responsibility.
 */
export function applyObjectiveResult(
  session: MissionSessionState,
  result: ObjectiveResult,
): MissionSessionState {
  const objectiveProgress = session.objectiveProgress.map((progress): ObjectiveProgress =>
    progress.objectiveId === result.objectiveId
      ? {
          objectiveId: progress.objectiveId,
          status: toProgressStatus(result.status),
          scorePoints: result.scorePoints,
        }
      : progress,
  );

  const currentObjectiveId = computeNextCurrentObjectiveId(
    session.grouping,
    objectiveProgress,
    session.currentObjectiveId,
  );

  return {
    ...session,
    objectiveProgress,
    currentObjectiveId,
  };
}
