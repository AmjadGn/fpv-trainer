/**
 * Mission session state machine.
 *
 * This is a pure, total reducer over a flat state enum — it holds no data
 * of its own (objective progress, scores, etc. live in `MissionSessionState`,
 * see session.ts). Every legal `(state, event.type)` pair is listed
 * explicitly in `TRANSITION_TABLE`; anything not listed is illegal and
 * `transitionMissionState` returns an explicit `ILLEGAL_TRANSITION` result
 * rather than silently ignoring the event or guessing a fallback state.
 *
 * The one deliberate self-transition is `active` + `objectiveCompleted` →
 * `active`: completing an objective never changes the mission's coarse
 * lifecycle state by itself (the mission stays active until a subsequent
 * `missionCompletionDetected` or `missionFailureDetected` event arrives).
 * Objective-level bookkeeping is handled by `applyObjectiveResult`
 * (apply-objective.ts), which operates on `MissionSessionState` directly.
 */

import type { MissionId } from './ids';
import type { ObjectiveId } from './ids';
import type { FailureReasonCode } from './policies';

export const MISSION_STATES = [
  'unavailable',
  'briefing',
  'loading',
  'loadFailed',
  'preparing',
  'ready',
  'active',
  'paused',
  'missionCompleted',
  'failed',
  'retrying',
  'results',
  'exiting',
] as const;

export type MissionState = (typeof MISSION_STATES)[number];

export type MissionRetryScope = 'entire_mission' | 'current_objective';

export type MissionStateEvent =
  | { readonly type: 'missionSelected'; readonly missionId: MissionId }
  | { readonly type: 'briefingAccepted' }
  | { readonly type: 'loadingStarted' }
  | { readonly type: 'contentLoaded' }
  | { readonly type: 'loadFailed'; readonly reasonCode: FailureReasonCode }
  | { readonly type: 'runtimePrepared' }
  | { readonly type: 'startRequested' }
  | { readonly type: 'pauseRequested' }
  | { readonly type: 'resumeRequested' }
  | { readonly type: 'objectiveCompleted'; readonly objectiveId: ObjectiveId }
  | { readonly type: 'missionCompletionDetected' }
  | { readonly type: 'missionFailureDetected'; readonly reasonCode: FailureReasonCode }
  | { readonly type: 'retryRequested'; readonly scope: MissionRetryScope }
  | { readonly type: 'retryPrepared' }
  | { readonly type: 'resultsPrepared' }
  | { readonly type: 'exitRequested' };

export const MISSION_STATE_EVENT_TYPES = [
  'missionSelected',
  'briefingAccepted',
  'loadingStarted',
  'contentLoaded',
  'loadFailed',
  'runtimePrepared',
  'startRequested',
  'pauseRequested',
  'resumeRequested',
  'objectiveCompleted',
  'missionCompletionDetected',
  'missionFailureDetected',
  'retryRequested',
  'retryPrepared',
  'resultsPrepared',
  'exitRequested',
] as const satisfies readonly MissionStateEvent['type'][];

export type MissionStateEventType = (typeof MISSION_STATE_EVENT_TYPES)[number];

export interface IllegalMissionTransition {
  readonly ok: false;
  readonly code: 'ILLEGAL_TRANSITION';
  readonly from: MissionState;
  readonly event: MissionStateEventType;
  readonly message: string;
}

export interface LegalMissionTransition {
  readonly ok: true;
  readonly state: MissionState;
}

export type MissionTransitionResult = LegalMissionTransition | IllegalMissionTransition;

/**
 * Explicit legal-transition table. Read as: from `state`, event type
 * `event.type` moves the machine to the mapped `MissionState`; any
 * `(state, eventType)` pair absent from its state's row is illegal.
 */
const TRANSITION_TABLE: Readonly<
  Record<MissionState, Readonly<Partial<Record<MissionStateEventType, MissionState>>>>
> = {
  unavailable: {
    missionSelected: 'briefing',
  },
  briefing: {
    briefingAccepted: 'loading',
    exitRequested: 'exiting',
  },
  loading: {
    contentLoaded: 'preparing',
    loadFailed: 'loadFailed',
    exitRequested: 'exiting',
  },
  loadFailed: {
    loadingStarted: 'loading',
    missionSelected: 'briefing',
    exitRequested: 'exiting',
  },
  preparing: {
    runtimePrepared: 'ready',
    loadFailed: 'loadFailed',
    exitRequested: 'exiting',
  },
  ready: {
    startRequested: 'active',
    exitRequested: 'exiting',
  },
  active: {
    pauseRequested: 'paused',
    objectiveCompleted: 'active',
    missionCompletionDetected: 'missionCompleted',
    missionFailureDetected: 'failed',
    exitRequested: 'exiting',
  },
  paused: {
    resumeRequested: 'active',
    exitRequested: 'exiting',
  },
  missionCompleted: {
    resultsPrepared: 'results',
    retryRequested: 'retrying',
    exitRequested: 'exiting',
  },
  failed: {
    resultsPrepared: 'results',
    retryRequested: 'retrying',
    exitRequested: 'exiting',
  },
  retrying: {
    retryPrepared: 'active',
    exitRequested: 'exiting',
  },
  results: {
    retryRequested: 'retrying',
    exitRequested: 'exiting',
  },
  exiting: {},
};

/**
 * Pure reducer: given the current mission lifecycle state and an event,
 * returns either the next legal state or an explicit `ILLEGAL_TRANSITION`
 * failure. Never throws, never silently falls back to the current state.
 */
export function transitionMissionState(
  state: MissionState,
  event: MissionStateEvent,
): MissionTransitionResult {
  const row = TRANSITION_TABLE[state];
  const nextState = row[event.type];
  if (nextState === undefined) {
    return {
      ok: false,
      code: 'ILLEGAL_TRANSITION',
      from: state,
      event: event.type,
      message: `Illegal mission state transition: cannot handle event "${event.type}" while in state "${state}".`,
    };
  }
  return { ok: true, state: nextState };
}

/** Whether `(state, eventType)` is a legal transition, without constructing an event. */
export function isLegalMissionTransition(
  state: MissionState,
  eventType: MissionStateEventType,
): boolean {
  return TRANSITION_TABLE[state][eventType] !== undefined;
}
