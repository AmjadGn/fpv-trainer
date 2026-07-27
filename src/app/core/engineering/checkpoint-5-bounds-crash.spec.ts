import { describe, expect, it } from 'vitest';

import type { BoundaryShape } from '@fpv/location-domain';
import { pointInBoundaryShape } from '@fpv/location-validation';
import type { Vec3 } from '@fpv/simulation-contracts';

import { FLIGHT_CONFIG } from '../flight/config/flight-config';
import {
  DEFAULT_FIXED_STEP_SECONDS,
  DEFAULT_OUT_OF_BOUNDS_GRACE_TICKS,
  MissionBoundaryRuntime,
  OUT_OF_BOUNDS_GRACE_SECONDS,
  authoredGraceTicksToSeconds,
  graceTicksFromFixedStep,
  type MissionBoundaryObserveOutcome,
} from '../mission/services/mission-boundary-runtime';
import { COASTAL_RUINS_LAYOUT } from '../../content/locations/mediterranean-expedition-region/layout';
import { getCoastalRuinsSurveyMission } from '../../content/locations/mediterranean-expedition-region/missions/coastal-ruins-survey';

/**
 * Checkpoint 5 — out-of-bounds grace countdown.
 *
 * The crash-failure half of the loop lives in `PhotographyMissionRuntime`
 * (Angular DI) and is covered by
 * `src/app/core/mission/services/checkpoint-5-mission-failure-runtime.spec.ts`.
 * This file covers the pure boundary countdown that drives it.
 */

const MISSION = getCoastalRuinsSurveyMission();
const AUTHORED_GRACE_TICKS_AT_60HZ =
  MISSION.failurePolicy.outOfBoundsAfterGrace.graceTicks as unknown as number;

/** Ticks of grace at the simulator's authoritative 1/120 step. */
const GRACE_TICKS = graceTicksFromFixedStep(
  OUT_OF_BOUNDS_GRACE_SECONDS,
  FLIGHT_CONFIG.physicsStep,
);

const PLAYABLE: BoundaryShape = {
  kind: 'aabb',
  aabb: {
    min: { ...COASTAL_RUINS_LAYOUT.playableBounds.min },
    max: { ...COASTAL_RUINS_LAYOUT.playableBounds.max },
  },
};

const INSIDE: Vec3 = { x: 0, y: 10, z: 0 };
const OUTSIDE: Vec3 = { x: 200, y: 10, z: 0 };
const SESSION = 3;

function configuredRuntime(
  graceSeconds: number = OUT_OF_BOUNDS_GRACE_SECONDS,
  fixedStepSeconds: number = FLIGHT_CONFIG.physicsStep,
): MissionBoundaryRuntime {
  const runtime = new MissionBoundaryRuntime();
  runtime.configure({
    shape: PLAYABLE,
    graceSeconds,
    fixedStepSeconds,
    sessionGeneration: SESSION,
  });
  return runtime;
}

function observeRun(
  runtime: MissionBoundaryRuntime,
  firstTick: number,
  tickCount: number,
  position: Vec3,
): readonly MissionBoundaryObserveOutcome[] {
  const outcomes: MissionBoundaryObserveOutcome[] = [];
  for (let i = 0; i < tickCount; i += 1) {
    outcomes.push(runtime.observe(firstTick + i, position, SESSION));
  }
  return outcomes;
}

describe('Checkpoint 5 — mission boundary grace countdown', () => {
  it('derives grace ticks from the authored 3 second duration and the active step rate', () => {
    expect(OUT_OF_BOUNDS_GRACE_SECONDS).toBe(3);
    expect(AUTHORED_GRACE_TICKS_AT_60HZ).toBe(DEFAULT_OUT_OF_BOUNDS_GRACE_TICKS);
    expect(authoredGraceTicksToSeconds(AUTHORED_GRACE_TICKS_AT_60HZ)).toBe(
      OUT_OF_BOUNDS_GRACE_SECONDS,
    );

    // 3 s is 180 ticks at 60 Hz and 360 ticks at the simulator's 1/120 step.
    expect(graceTicksFromFixedStep(3, DEFAULT_FIXED_STEP_SECONDS)).toBe(180);
    expect(graceTicksFromFixedStep(3, FLIGHT_CONFIG.physicsStep)).toBe(360);
    expect(GRACE_TICKS).toBe(360);

    // Ceiling rounding: grace is never shorter than the authored duration.
    expect(graceTicksFromFixedStep(3, 1 / 90.5)).toBe(Math.ceil(3 * 90.5));
    expect(graceTicksFromFixedStep(Number.NaN, 1 / 60)).toBe(
      DEFAULT_OUT_OF_BOUNDS_GRACE_TICKS,
    );
    expect(graceTicksFromFixedStep(3, 0)).toBe(DEFAULT_OUT_OF_BOUNDS_GRACE_TICKS);
    expect(authoredGraceTicksToSeconds(Number.NaN)).toBe(OUT_OF_BOUNDS_GRACE_SECONDS);
  });

  it('shares containment semantics with authored-content validation', () => {
    expect(MISSION.failurePolicy.outOfBoundsAfterGrace.enabled).toBe(true);
    expect(pointInBoundaryShape(INSIDE, PLAYABLE)).toBe(true);
    expect(pointInBoundaryShape(OUTSIDE, PLAYABLE)).toBe(false);

    // Boundary faces are inclusive, matching authored-content validation.
    const onFace: Vec3 = { ...COASTAL_RUINS_LAYOUT.playableBounds.max };
    expect(pointInBoundaryShape(onFace, PLAYABLE)).toBe(true);
    expect(configuredRuntime().observe(1, onFace, SESSION)).toBe('inside');
  });

  it('reports unconfigured until a boundary shape is bound', () => {
    const runtime = new MissionBoundaryRuntime();
    expect(runtime.observe(1, OUTSIDE, SESSION)).toBe('unconfigured');
    const state = runtime.state();
    expect(state.configured).toBe(false);
    expect(state.graceTicks).toBe(0);
    expect(state.remainingTicks).toBe(0);
    expect(state.expired).toBe(false);
  });

  it('stays quiet while the aircraft is inside the boundary', () => {
    const runtime = configuredRuntime();
    const outcomes = observeRun(runtime, 0, 50, INSIDE);

    expect(new Set(outcomes)).toEqual(new Set(['inside']));
    const state = runtime.state();
    expect(state.configured).toBe(true);
    expect(state.outOfBounds).toBe(false);
    expect(state.graceTicks).toBe(GRACE_TICKS);
    expect(state.remainingTicks).toBe(GRACE_TICKS);
    expect(state.expired).toBe(false);
  });

  it('starts and advances the countdown when the aircraft exits the boundary', () => {
    const runtime = configuredRuntime();
    runtime.observe(0, INSIDE, SESSION);

    expect(runtime.observe(1, OUTSIDE, SESSION)).toBe('countdown-started');
    expect(runtime.state().outOfBounds).toBe(true);
    expect(runtime.state().continuousOutOfBoundsTicks).toBe(1);
    expect(runtime.state().remainingTicks).toBe(GRACE_TICKS - 1);

    expect(runtime.observe(2, OUTSIDE, SESSION)).toBe('countdown-advanced');
    expect(runtime.state().remainingTicks).toBe(GRACE_TICKS - 2);
  });

  it('resets the countdown on re-entry', () => {
    const runtime = configuredRuntime();
    runtime.observe(0, INSIDE, SESSION);
    observeRun(runtime, 1, 90, OUTSIDE);
    expect(runtime.state().continuousOutOfBoundsTicks).toBe(90);

    expect(runtime.observe(91, INSIDE, SESSION)).toBe('countdown-reset');
    expect(runtime.state().continuousOutOfBoundsTicks).toBe(0);
    expect(runtime.state().remainingTicks).toBe(GRACE_TICKS);
    expect(runtime.state().expired).toBe(false);

    // A later excursion gets the full grace again.
    expect(runtime.observe(92, OUTSIDE, SESSION)).toBe('countdown-started');
  });

  it('consumes the full grace over 180 contiguous ticks at 60 Hz and fails on the next one', () => {
    const runtime = configuredRuntime(OUT_OF_BOUNDS_GRACE_SECONDS, DEFAULT_FIXED_STEP_SECONDS);
    expect(runtime.state().graceTicks).toBe(180);
    runtime.observe(0, INSIDE, SESSION);

    const outcomes = observeRun(runtime, 1, 180, OUTSIDE);
    expect(outcomes[0]).toBe('countdown-started');
    expect(outcomes[179]).toBe('countdown-advanced');
    expect(outcomes).not.toContain('expired');

    const consumed = runtime.state();
    expect(consumed.continuousOutOfBoundsTicks).toBe(180);
    expect(consumed.remainingTicks).toBe(0);
    expect(consumed.remainingSeconds).toBe(0);
    expect(consumed.expired).toBe(false);

    expect(runtime.observe(181, OUTSIDE, SESSION)).toBe('expired');
    expect(runtime.state().expired).toBe(true);
  });

  it('consumes the same 3 seconds of grace at the simulator step rate', () => {
    const runtime = configuredRuntime();
    runtime.observe(0, INSIDE, SESSION);

    const outcomes = observeRun(runtime, 1, GRACE_TICKS, OUTSIDE);
    expect(outcomes).not.toContain('expired');
    expect(runtime.state().remainingSeconds).toBe(0);
    expect(runtime.observe(GRACE_TICKS + 1, OUTSIDE, SESSION)).toBe('expired');
    expect(GRACE_TICKS * FLIGHT_CONFIG.physicsStep).toBeCloseTo(
      OUT_OF_BOUNDS_GRACE_SECONDS,
      10,
    );
  });

  it('reports expiry exactly once so the mission can only fail once', () => {
    const runtime = configuredRuntime();
    runtime.observe(0, INSIDE, SESSION);
    const outcomes = observeRun(runtime, 1, GRACE_TICKS + 20, OUTSIDE);

    expect(outcomes.filter((outcome) => outcome === 'expired')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === 'already-expired')).toHaveLength(19);
    expect(runtime.state().expired).toBe(true);
  });

  it('expires immediately when the authored grace is zero', () => {
    const runtime = configuredRuntime(0);
    expect(runtime.state().graceTicks).toBe(0);
    runtime.observe(0, INSIDE, SESSION);
    expect(runtime.observe(1, OUTSIDE, SESSION)).toBe('expired');
  });

  it('freezes the countdown across a pause, because paused steps are never observed', () => {
    const runtime = configuredRuntime();
    runtime.observe(0, INSIDE, SESSION);
    observeRun(runtime, 1, GRACE_TICKS - 1, OUTSIDE);
    expect(runtime.state().continuousOutOfBoundsTicks).toBe(GRACE_TICKS - 1);

    // Paused for 10_000 authoritative steps: nothing is observed, so the
    // countdown cannot advance and cannot expire while paused.
    const resumeTick = GRACE_TICKS - 1 + 10_000;
    expect(runtime.observe(resumeTick, OUTSIDE, SESSION)).toBe('countdown-started');
    expect(runtime.state().continuousOutOfBoundsTicks).toBe(1);
    expect(runtime.state().expired).toBe(false);
  });

  it('restarts rather than credits unobserved ticks after a gap or a repeated tick', () => {
    const gapped = configuredRuntime();
    gapped.observe(0, INSIDE, SESSION);
    observeRun(gapped, 1, 50, OUTSIDE);
    expect(gapped.observe(60, OUTSIDE, SESSION)).toBe('countdown-started');
    expect(gapped.state().continuousOutOfBoundsTicks).toBe(1);

    const repeated = configuredRuntime();
    repeated.observe(0, INSIDE, SESSION);
    observeRun(repeated, 1, 50, OUTSIDE);
    expect(repeated.observe(50, OUTSIDE, SESSION)).toBe('countdown-started');
    expect(repeated.state().continuousOutOfBoundsTicks).toBe(1);
  });

  it('rejects stale sessions and non-finite input without touching the countdown', () => {
    const runtime = configuredRuntime();
    runtime.observe(0, INSIDE, SESSION);
    observeRun(runtime, 1, 30, OUTSIDE);

    expect(runtime.observe(31, OUTSIDE, SESSION + 1)).toBe('stale-session');
    expect(runtime.observe(Number.NaN, OUTSIDE, SESSION)).toBe('invalid-input');
    expect(runtime.observe(31, { x: Number.NaN, y: 0, z: 0 }, SESSION)).toBe('invalid-input');
    expect(runtime.state().continuousOutOfBoundsTicks).toBe(30);
    expect(runtime.state().expired).toBe(false);
  });

  it('clears the expiry latch on retry (rebindSession) and on reset', () => {
    const runtime = configuredRuntime();
    runtime.observe(0, INSIDE, SESSION);
    observeRun(runtime, 1, GRACE_TICKS + 1, OUTSIDE);
    expect(runtime.state().expired).toBe(true);

    runtime.rebindSession(SESSION + 1);
    expect(runtime.state().expired).toBe(false);
    expect(runtime.state().continuousOutOfBoundsTicks).toBe(0);
    expect(runtime.observe(1, OUTSIDE, SESSION)).toBe('stale-session');
    expect(runtime.observe(1, OUTSIDE, SESSION + 1)).toBe('countdown-started');

    runtime.reset();
    expect(runtime.state().expired).toBe(false);
    expect(runtime.state().remainingTicks).toBe(GRACE_TICKS);
  });

  it('drops all configuration on clear', () => {
    const runtime = configuredRuntime();
    runtime.clear();
    expect(runtime.observe(1, OUTSIDE, SESSION)).toBe('unconfigured');
    expect(runtime.state().configured).toBe(false);
  });

  it('recomputes grace and restarts the countdown when the step rate changes', () => {
    const runtime = configuredRuntime(OUT_OF_BOUNDS_GRACE_SECONDS, DEFAULT_FIXED_STEP_SECONDS);
    runtime.observe(0, INSIDE, SESSION);
    runtime.observe(1, OUTSIDE, SESSION);
    expect(runtime.state().graceTicks).toBe(180);
    expect(runtime.state().remainingSeconds).toBeCloseTo(179 * DEFAULT_FIXED_STEP_SECONDS, 10);

    runtime.updateFixedStepSeconds(FLIGHT_CONFIG.physicsStep);
    const rescaled = runtime.state();
    expect(rescaled.graceTicks).toBe(360);
    expect(rescaled.fixedStepSeconds).toBe(FLIGHT_CONFIG.physicsStep);
    expect(rescaled.continuousOutOfBoundsTicks).toBe(0);
    expect(rescaled.remainingSeconds).toBeCloseTo(OUT_OF_BOUNDS_GRACE_SECONDS, 10);

    // Ignored: non-positive, non-finite, or unchanged step rates.
    runtime.updateFixedStepSeconds(0);
    runtime.updateFixedStepSeconds(Number.NaN);
    runtime.updateFixedStepSeconds(FLIGHT_CONFIG.physicsStep);
    expect(runtime.state().graceTicks).toBe(360);
  });

  it('falls back to safe defaults for a non-finite grace or step configuration', () => {
    const runtime = new MissionBoundaryRuntime();
    runtime.configure({
      shape: PLAYABLE,
      graceSeconds: Number.NaN,
      fixedStepSeconds: -1,
      sessionGeneration: SESSION,
    });
    const state = runtime.state();
    expect(state.graceSeconds).toBe(OUT_OF_BOUNDS_GRACE_SECONDS);
    expect(state.fixedStepSeconds).toBe(DEFAULT_FIXED_STEP_SECONDS);
    expect(state.graceTicks).toBe(DEFAULT_OUT_OF_BOUNDS_GRACE_TICKS);
  });
});
