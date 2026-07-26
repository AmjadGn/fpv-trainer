import { describe, expect, it } from 'vitest';
import { asMissionId, asObjectiveId } from './ids';
import {
  isLegalMissionTransition,
  MISSION_STATE_EVENT_TYPES,
  MISSION_STATES,
  transitionMissionState,
  type MissionState,
  type MissionStateEvent,
  type MissionStateEventType,
} from './state-machine';

const missionId = asMissionId('mission-1');
const objectiveId = asObjectiveId('objective-1');

function sampleEvent(type: MissionStateEventType): MissionStateEvent {
  switch (type) {
    case 'missionSelected':
      return { type, missionId };
    case 'briefingAccepted':
      return { type };
    case 'loadingStarted':
      return { type };
    case 'contentLoaded':
      return { type };
    case 'loadFailed':
      return { type, reasonCode: 'LOCATION_LOAD_FAILED' };
    case 'runtimePrepared':
      return { type };
    case 'startRequested':
      return { type };
    case 'pauseRequested':
      return { type };
    case 'resumeRequested':
      return { type };
    case 'objectiveCompleted':
      return { type, objectiveId };
    case 'missionCompletionDetected':
      return { type };
    case 'missionFailureDetected':
      return { type, reasonCode: 'AIRCRAFT_CRASHED' };
    case 'retryRequested':
      return { type, scope: 'entire_mission' };
    case 'retryPrepared':
      return { type };
    case 'resultsPrepared':
      return { type };
    case 'exitRequested':
      return { type };
  }
}

interface LegalTransitionCase {
  readonly from: MissionState;
  readonly eventType: MissionStateEventType;
  readonly to: MissionState;
}

const LEGAL_TRANSITIONS: readonly LegalTransitionCase[] = [
  { from: 'unavailable', eventType: 'missionSelected', to: 'briefing' },

  { from: 'briefing', eventType: 'briefingAccepted', to: 'loading' },
  { from: 'briefing', eventType: 'exitRequested', to: 'exiting' },

  { from: 'loading', eventType: 'contentLoaded', to: 'preparing' },
  { from: 'loading', eventType: 'loadFailed', to: 'loadFailed' },
  { from: 'loading', eventType: 'exitRequested', to: 'exiting' },

  { from: 'loadFailed', eventType: 'loadingStarted', to: 'loading' },
  { from: 'loadFailed', eventType: 'missionSelected', to: 'briefing' },
  { from: 'loadFailed', eventType: 'exitRequested', to: 'exiting' },

  { from: 'preparing', eventType: 'runtimePrepared', to: 'ready' },
  { from: 'preparing', eventType: 'loadFailed', to: 'loadFailed' },
  { from: 'preparing', eventType: 'exitRequested', to: 'exiting' },

  { from: 'ready', eventType: 'startRequested', to: 'active' },
  { from: 'ready', eventType: 'exitRequested', to: 'exiting' },

  { from: 'active', eventType: 'pauseRequested', to: 'paused' },
  { from: 'active', eventType: 'objectiveCompleted', to: 'active' },
  { from: 'active', eventType: 'missionCompletionDetected', to: 'missionCompleted' },
  { from: 'active', eventType: 'missionFailureDetected', to: 'failed' },
  { from: 'active', eventType: 'exitRequested', to: 'exiting' },

  { from: 'paused', eventType: 'resumeRequested', to: 'active' },
  { from: 'paused', eventType: 'exitRequested', to: 'exiting' },

  { from: 'missionCompleted', eventType: 'resultsPrepared', to: 'results' },
  { from: 'missionCompleted', eventType: 'retryRequested', to: 'retrying' },
  { from: 'missionCompleted', eventType: 'exitRequested', to: 'exiting' },

  { from: 'failed', eventType: 'resultsPrepared', to: 'results' },
  { from: 'failed', eventType: 'retryRequested', to: 'retrying' },
  { from: 'failed', eventType: 'exitRequested', to: 'exiting' },

  { from: 'retrying', eventType: 'retryPrepared', to: 'active' },
  { from: 'retrying', eventType: 'exitRequested', to: 'exiting' },

  { from: 'results', eventType: 'retryRequested', to: 'retrying' },
  { from: 'results', eventType: 'exitRequested', to: 'exiting' },
];

const LEGAL_SET = new Set(LEGAL_TRANSITIONS.map((t) => `${t.from}:${t.eventType}`));

describe('transitionMissionState: every legal transition', () => {
  it.each(LEGAL_TRANSITIONS)('$from + $eventType -> $to', ({ from, eventType, to }) => {
    const result = transitionMissionState(from, sampleEvent(eventType));
    expect(result).toEqual({ ok: true, state: to });
    expect(isLegalMissionTransition(from, eventType)).toBe(true);
  });
});

describe('transitionMissionState: every illegal transition', () => {
  for (const from of MISSION_STATES) {
    for (const eventType of MISSION_STATE_EVENT_TYPES) {
      if (LEGAL_SET.has(`${from}:${eventType}`)) {
        continue;
      }
      it(`rejects "${eventType}" while in "${from}"`, () => {
        const result = transitionMissionState(from, sampleEvent(eventType));
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe('ILLEGAL_TRANSITION');
          expect(result.from).toBe(from);
          expect(result.event).toBe(eventType);
          expect(result.message).toContain(from);
          expect(result.message).toContain(eventType);
        }
        expect(isLegalMissionTransition(from, eventType)).toBe(false);
      });
    }
  }
});

describe('transitionMissionState: exhaustiveness sanity checks', () => {
  it('the enumerated legal-transition fixture matches the reducer exactly', () => {
    let legalCount = 0;
    for (const from of MISSION_STATES) {
      for (const eventType of MISSION_STATE_EVENT_TYPES) {
        if (isLegalMissionTransition(from, eventType)) {
          legalCount += 1;
        }
      }
    }
    expect(legalCount).toBe(LEGAL_TRANSITIONS.length);
  });

  it('every event type is exercised by at least one legal transition', () => {
    const usedEventTypes = new Set(LEGAL_TRANSITIONS.map((t) => t.eventType));
    for (const eventType of MISSION_STATE_EVENT_TYPES) {
      expect(usedEventTypes.has(eventType)).toBe(true);
    }
  });

  it('"exiting" is a terminal state with no legal outgoing transitions', () => {
    for (const eventType of MISSION_STATE_EVENT_TYPES) {
      expect(isLegalMissionTransition('exiting', eventType)).toBe(false);
    }
  });
});

describe('transitionMissionState: named scenarios', () => {
  it('pause then resume returns to active', () => {
    expect(transitionMissionState('active', { type: 'pauseRequested' })).toEqual({
      ok: true,
      state: 'paused',
    });
    expect(transitionMissionState('paused', { type: 'resumeRequested' })).toEqual({
      ok: true,
      state: 'active',
    });
  });

  it('objectiveCompleted keeps the mission active (self-transition), never falling back silently', () => {
    const result = transitionMissionState('active', { type: 'objectiveCompleted', objectiveId });
    expect(result).toEqual({ ok: true, state: 'active' });
  });

  it('load failure can be retried directly back into loading', () => {
    expect(
      transitionMissionState('loading', { type: 'loadFailed', reasonCode: 'LOCATION_LOAD_FAILED' }),
    ).toEqual({ ok: true, state: 'loadFailed' });
    expect(transitionMissionState('loadFailed', { type: 'loadingStarted' })).toEqual({
      ok: true,
      state: 'loading',
    });
    expect(transitionMissionState('loading', { type: 'contentLoaded' })).toEqual({
      ok: true,
      state: 'preparing',
    });
    expect(transitionMissionState('preparing', { type: 'runtimePrepared' })).toEqual({
      ok: true,
      state: 'ready',
    });
    expect(transitionMissionState('ready', { type: 'startRequested' })).toEqual({
      ok: true,
      state: 'active',
    });
  });

  it('runtime preparation failure also routes through loadFailed', () => {
    const result = transitionMissionState('preparing', {
      type: 'loadFailed',
      reasonCode: 'RUNTIME_PREPARATION_FAILED',
    });
    expect(result).toEqual({ ok: true, state: 'loadFailed' });
  });

  it('mission completion flows into results', () => {
    expect(transitionMissionState('active', { type: 'missionCompletionDetected' })).toEqual({
      ok: true,
      state: 'missionCompleted',
    });
    expect(transitionMissionState('missionCompleted', { type: 'resultsPrepared' })).toEqual({
      ok: true,
      state: 'results',
    });
  });

  it('mission failure supports retrying the entire mission', () => {
    expect(
      transitionMissionState('active', {
        type: 'missionFailureDetected',
        reasonCode: 'AIRCRAFT_CRASHED',
      }),
    ).toEqual({ ok: true, state: 'failed' });
    expect(
      transitionMissionState('failed', { type: 'retryRequested', scope: 'entire_mission' }),
    ).toEqual({ ok: true, state: 'retrying' });
    expect(transitionMissionState('retrying', { type: 'retryPrepared' })).toEqual({
      ok: true,
      state: 'active',
    });
  });

  it('mission failure supports retrying only the current objective', () => {
    expect(
      transitionMissionState('failed', { type: 'retryRequested', scope: 'current_objective' }),
    ).toEqual({ ok: true, state: 'retrying' });
    expect(transitionMissionState('retrying', { type: 'retryPrepared' })).toEqual({
      ok: true,
      state: 'active',
    });
  });

  it('results screen supports playing again', () => {
    expect(
      transitionMissionState('results', { type: 'retryRequested', scope: 'entire_mission' }),
    ).toEqual({ ok: true, state: 'retrying' });
  });

  it('exitRequested tears the session down from every state that legally supports it', () => {
    const exitableStates: readonly MissionState[] = [
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
    ];
    for (const from of exitableStates) {
      expect(transitionMissionState(from, { type: 'exitRequested' })).toEqual({
        ok: true,
        state: 'exiting',
      });
    }
  });

  it('illegal transitions carry actionable diagnostic detail and never throw', () => {
    const result = transitionMissionState('unavailable', { type: 'startRequested' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ILLEGAL_TRANSITION');
      expect(result.from).toBe('unavailable');
      expect(result.event).toBe('startRequested');
      expect(result.message).toContain('unavailable');
      expect(result.message).toContain('startRequested');
    }
  });
});
