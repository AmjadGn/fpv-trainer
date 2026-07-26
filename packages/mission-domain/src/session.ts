/**
 * Mission session data: the mutable-in-spirit (but always replaced
 * immutably) state tracked across one mission attempt, separate from the
 * coarse lifecycle FSM in state-machine.ts.
 */

import { asElapsedTicks, type ElapsedTicks } from '@fpv/simulation-contracts';
import type { MissionId, MissionSessionId, ObjectiveId } from './ids';
import type { MissionDefinition } from './mission-definition';
import type { ObjectiveGrouping } from './objectives';
import type { MissionState } from './state-machine';

export type ObjectiveProgressStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped';

export interface ObjectiveProgress {
  readonly objectiveId: ObjectiveId;
  readonly status: ObjectiveProgressStatus;
  readonly scorePoints: number;
}

export interface MissionSessionState {
  readonly sessionId: MissionSessionId;
  readonly missionId: MissionId;
  readonly state: MissionState;
  /** Copied from the mission definition at session creation so downstream
   * pure updates (see apply-objective.ts) don't need the full definition. */
  readonly grouping: ObjectiveGrouping;
  readonly objectiveProgress: readonly ObjectiveProgress[];
  readonly currentObjectiveId: ObjectiveId | null;
  readonly elapsedTicks: ElapsedTicks;
  readonly retryCount: number;
}

function computeInitialCurrentObjectiveId(grouping: ObjectiveGrouping): ObjectiveId | null {
  if (grouping.mode !== 'sequential') {
    return null;
  }
  return grouping.requiredObjectiveIds[0] ?? null;
}

/**
 * Creates a fresh `MissionSessionState` for a mission attempt, starting in
 * the `'unavailable'` lifecycle state. Callers drive the session forward
 * via `transitionMissionState` (e.g. a `missionSelected` event to reach
 * `'briefing'`).
 */
export function createMissionSession(
  sessionId: MissionSessionId,
  mission: MissionDefinition,
): MissionSessionState {
  return {
    sessionId,
    missionId: mission.missionId,
    state: 'unavailable',
    grouping: mission.grouping,
    objectiveProgress: mission.objectives.map((objective) => ({
      objectiveId: objective.objectiveId,
      status: 'pending',
      scorePoints: 0,
    })),
    currentObjectiveId: computeInitialCurrentObjectiveId(mission.grouping),
    elapsedTicks: asElapsedTicks(0),
    retryCount: 0,
  };
}
