import { describe, expect, it } from 'vitest';

import {
  PhotoStabilityWindow,
  bodyAngularSpeedMagnitude,
  type PhotoStabilityObserveOutcome,
  type PhotoStabilityThresholds,
} from '../mission/services/photo-stability-window';
import { COASTAL_RUINS_PHOTO_OBJECTIVES } from '../../content/locations/mediterranean-expedition-region/missions/photography-objectives';

/**
 * Checkpoint 5 — deterministic stability window.
 *
 * Thresholds and hold duration come from the authored Coastal Ruins
 * objectives so the gate under test is the one the mission actually runs.
 */

const ARCH = COASTAL_RUINS_PHOTO_OBJECTIVES[0];
const LOOKOUT = COASTAL_RUINS_PHOTO_OBJECTIVES[1];

const THRESHOLDS: PhotoStabilityThresholds = {
  maxLinearSpeedMps: ARCH.maxLinearSpeedMps,
  maxBodyAngularSpeedRadps: ARCH.maxBodyAngularSpeedRadps,
};
const REQUIRED_TICKS = ARCH.stabilityDurationTicks as unknown as number;
const SESSION = 7;
const OBJECTIVE = String(ARCH.objectiveId);
const OTHER_OBJECTIVE = String(LOOKOUT.objectiveId);

const STEADY_LINEAR = 0.4;
const STEADY_ANGULAR = 0.15;

function boundWindow(): PhotoStabilityWindow {
  const window = new PhotoStabilityWindow();
  window.beginObjective(SESSION, OBJECTIVE, THRESHOLDS);
  return window;
}

function observeRun(
  window: PhotoStabilityWindow,
  firstTick: number,
  tickCount: number,
  linear = STEADY_LINEAR,
  angular = STEADY_ANGULAR,
): readonly PhotoStabilityObserveOutcome[] {
  const outcomes: PhotoStabilityObserveOutcome[] = [];
  for (let i = 0; i < tickCount; i += 1) {
    outcomes.push(window.observe(firstTick + i, linear, angular, SESSION, OBJECTIVE));
  }
  return outcomes;
}

describe('Checkpoint 5 — photo stability window', () => {
  it('accumulates exactly one tick per contiguous authoritative observation', () => {
    const window = boundWindow();
    const outcomes = observeRun(window, 100, 10);

    expect(new Set(outcomes)).toEqual(new Set(['accumulated']));
    expect(window.snapshot(REQUIRED_TICKS).continuousStableTicks).toBe(10);
    expect(window.snapshot(REQUIRED_TICKS).lastObservedTick).toBe(109);
  });

  it('becomes stable at exactly the authored duration and not one tick earlier', () => {
    const window = boundWindow();

    observeRun(window, 0, REQUIRED_TICKS - 1);
    expect(window.snapshot(REQUIRED_TICKS).isStable).toBe(false);

    window.observe(REQUIRED_TICKS - 1, STEADY_LINEAR, STEADY_ANGULAR, SESSION, OBJECTIVE);
    const snapshot = window.snapshot(REQUIRED_TICKS);
    expect(snapshot.continuousStableTicks).toBe(REQUIRED_TICKS);
    expect(snapshot.isStable).toBe(true);
    expect(snapshot.requiredDurationTicks).toBe(REQUIRED_TICKS);
  });

  it('drops the whole run when a single tick breaches a speed threshold', () => {
    const window = boundWindow();
    observeRun(window, 0, REQUIRED_TICKS - 1);

    const breach = window.observe(
      REQUIRED_TICKS - 1,
      THRESHOLDS.maxLinearSpeedMps + 0.5,
      STEADY_ANGULAR,
      SESSION,
      OBJECTIVE,
    );

    expect(breach).toBe('reset-speed');
    expect(window.snapshot(REQUIRED_TICKS).continuousStableTicks).toBe(0);
    expect(window.snapshot(REQUIRED_TICKS).isStable).toBe(false);
    expect(window.snapshot(REQUIRED_TICKS).withinLinearSpeed).toBe(false);

    // The pilot must hold the full duration again after the breach.
    observeRun(window, REQUIRED_TICKS, REQUIRED_TICKS);
    expect(window.snapshot(REQUIRED_TICKS).isStable).toBe(true);
  });

  it('treats the linear speed threshold as inclusive', () => {
    const atLimit = boundWindow();
    expect(
      atLimit.observe(1, THRESHOLDS.maxLinearSpeedMps, STEADY_ANGULAR, SESSION, OBJECTIVE),
    ).toBe('accumulated');
    expect(atLimit.snapshot(REQUIRED_TICKS).withinLinearSpeed).toBe(true);

    const overLimit = boundWindow();
    expect(
      overLimit.observe(
        1,
        THRESHOLDS.maxLinearSpeedMps + 1e-9,
        STEADY_ANGULAR,
        SESSION,
        OBJECTIVE,
      ),
    ).toBe('reset-speed');
  });

  it('treats the body angular speed threshold as inclusive', () => {
    const atLimit = boundWindow();
    expect(
      atLimit.observe(
        1,
        STEADY_LINEAR,
        THRESHOLDS.maxBodyAngularSpeedRadps,
        SESSION,
        OBJECTIVE,
      ),
    ).toBe('accumulated');
    expect(atLimit.snapshot(REQUIRED_TICKS).withinAngularSpeed).toBe(true);

    const overLimit = boundWindow();
    expect(
      overLimit.observe(
        1,
        STEADY_LINEAR,
        THRESHOLDS.maxBodyAngularSpeedRadps + 1e-9,
        SESSION,
        OBJECTIVE,
      ),
    ).toBe('reset-speed');
  });

  it('derives body angular speed as the magnitude of pitch/yaw/roll rates', () => {
    expect(bodyAngularSpeedMagnitude({ pitch: 3, yaw: 4, roll: 0 })).toBe(5);
    expect(bodyAngularSpeedMagnitude({ pitch: 0, yaw: 0, roll: 0 })).toBe(0);

    const window = boundWindow();
    const rates = { pitch: 1.5, yaw: 1.5, roll: 0.5 };
    expect(bodyAngularSpeedMagnitude(rates)).toBeGreaterThan(
      THRESHOLDS.maxBodyAngularSpeedRadps,
    );
    expect(
      window.observe(1, STEADY_LINEAR, bodyAngularSpeedMagnitude(rates), SESSION, OBJECTIVE),
    ).toBe('reset-speed');
  });

  it('resets on a tick gap, a repeated tick, and a backwards tick', () => {
    const gap = boundWindow();
    observeRun(gap, 0, 5);
    expect(gap.observe(6, STEADY_LINEAR, STEADY_ANGULAR, SESSION, OBJECTIVE)).toBe(
      'reset-tick-gap',
    );
    expect(gap.snapshot(REQUIRED_TICKS).continuousStableTicks).toBe(0);

    const repeated = boundWindow();
    observeRun(repeated, 0, 5);
    expect(repeated.observe(4, STEADY_LINEAR, STEADY_ANGULAR, SESSION, OBJECTIVE)).toBe(
      'reset-tick-gap',
    );

    const backwards = boundWindow();
    observeRun(backwards, 0, 5);
    expect(backwards.observe(2, STEADY_LINEAR, STEADY_ANGULAR, SESSION, OBJECTIVE)).toBe(
      'reset-tick-gap',
    );
    expect(backwards.snapshot(REQUIRED_TICKS).continuousStableTicks).toBe(0);
  });

  it('never accumulates across an objective change', () => {
    const window = boundWindow();
    observeRun(window, 0, REQUIRED_TICKS - 1);

    const crossObjective = window.observe(
      REQUIRED_TICKS - 1,
      STEADY_LINEAR,
      STEADY_ANGULAR,
      SESSION,
      OTHER_OBJECTIVE,
    );

    expect(crossObjective).toBe('reset-objective');
    expect(window.snapshot(REQUIRED_TICKS).continuousStableTicks).toBe(0);
    expect(window.snapshot(REQUIRED_TICKS).objectiveId).toBe(OBJECTIVE);
  });

  it('never accumulates across a session generation change', () => {
    const window = boundWindow();
    observeRun(window, 0, 10);

    expect(
      window.observe(10, STEADY_LINEAR, STEADY_ANGULAR, SESSION + 1, OBJECTIVE),
    ).toBe('reset-session');
    expect(window.snapshot(REQUIRED_TICKS).continuousStableTicks).toBe(0);
  });

  it('clears the run when re-bound to a new objective or re-bound on retry', () => {
    const window = boundWindow();
    observeRun(window, 0, REQUIRED_TICKS);
    expect(window.snapshot(REQUIRED_TICKS).isStable).toBe(true);

    window.beginObjective(SESSION, OTHER_OBJECTIVE, {
      maxLinearSpeedMps: LOOKOUT.maxLinearSpeedMps,
      maxBodyAngularSpeedRadps: LOOKOUT.maxBodyAngularSpeedRadps,
    });
    const rebound = window.snapshot(REQUIRED_TICKS);
    expect(rebound.continuousStableTicks).toBe(0);
    expect(rebound.lastObservedTick).toBeNull();
    expect(rebound.objectiveId).toBe(OTHER_OBJECTIVE);
    expect(rebound.isStable).toBe(false);

    // A retry re-binds under a fresh session generation and starts from zero.
    window.beginObjective(SESSION + 1, OBJECTIVE, THRESHOLDS);
    expect(window.snapshot(REQUIRED_TICKS).sessionGeneration).toBe(SESSION + 1);
    expect(window.snapshot(REQUIRED_TICKS).continuousStableTicks).toBe(0);
  });

  it('does not accumulate across a pause, because paused steps are never observed', () => {
    const window = boundWindow();
    observeRun(window, 0, REQUIRED_TICKS - 1);
    expect(window.snapshot(REQUIRED_TICKS).continuousStableTicks).toBe(REQUIRED_TICKS - 1);

    // Paused: the runtime returns before observing, so ticks 23..322 never arrive.
    const resumeTick = REQUIRED_TICKS - 1 + 300;
    expect(
      window.observe(resumeTick, STEADY_LINEAR, STEADY_ANGULAR, SESSION, OBJECTIVE),
    ).toBe('reset-tick-gap');
    expect(window.snapshot(REQUIRED_TICKS).continuousStableTicks).toBe(0);
    expect(window.snapshot(REQUIRED_TICKS).isStable).toBe(false);
  });

  it('rejects non-finite observations without accumulating', () => {
    const window = boundWindow();
    observeRun(window, 0, 5);

    expect(window.observe(Number.NaN, STEADY_LINEAR, STEADY_ANGULAR, SESSION, OBJECTIVE)).toBe(
      'reset-invalid-input',
    );
    expect(window.snapshot(REQUIRED_TICKS).continuousStableTicks).toBe(0);

    observeRun(window, 10, 3);
    expect(
      window.observe(13, Number.POSITIVE_INFINITY, STEADY_ANGULAR, SESSION, OBJECTIVE),
    ).toBe('reset-invalid-input');
    expect(window.observe(13, STEADY_LINEAR, Number.NaN, SESSION, OBJECTIVE)).toBe(
      'reset-invalid-input',
    );
  });

  it('produces byte-identical snapshots for identical observation sequences', () => {
    const sequence = [
      { tick: 0, linear: 0.2, angular: 0.1 },
      { tick: 1, linear: 0.25, angular: 0.12 },
      { tick: 2, linear: 9, angular: 0.12 },
      { tick: 3, linear: 0.2, angular: 0.1 },
      { tick: 5, linear: 0.2, angular: 0.1 },
      { tick: 6, linear: 0.2, angular: 0.1 },
    ];

    const run = (): string => {
      const window = boundWindow();
      const outcomes = sequence.map((step) =>
        window.observe(step.tick, step.linear, step.angular, SESSION, OBJECTIVE),
      );
      return JSON.stringify({ outcomes, snapshot: window.snapshot(REQUIRED_TICKS) });
    };

    const first = run();
    for (let i = 0; i < 25; i += 1) {
      expect(run()).toBe(first);
    }
    expect(JSON.parse(first).outcomes).toEqual([
      'accumulated',
      'accumulated',
      'reset-speed',
      'accumulated',
      'reset-tick-gap',
      'accumulated',
    ]);
  });

  it('reports a neutral snapshot after a full reset', () => {
    const window = boundWindow();
    observeRun(window, 0, 5);
    window.reset();

    const snapshot = window.snapshot(REQUIRED_TICKS);
    expect(snapshot.sessionGeneration).toBeNull();
    expect(snapshot.objectiveId).toBeNull();
    expect(snapshot.lastObservedTick).toBeNull();
    expect(snapshot.continuousStableTicks).toBe(0);
    expect(snapshot.lastLinearSpeedMps).toBeNull();
    expect(snapshot.lastBodyAngularSpeedRadps).toBeNull();
    expect(snapshot.thresholds).toEqual({
      maxLinearSpeedMps: 0,
      maxBodyAngularSpeedRadps: 0,
    });
  });

  it('clamps a non-finite or negative required duration to zero', () => {
    const window = boundWindow();
    observeRun(window, 0, 3);

    expect(window.snapshot(Number.NaN).requiredDurationTicks).toBe(0);
    expect(window.snapshot(-10).requiredDurationTicks).toBe(0);
    expect(window.snapshot(-10).isStable).toBe(true);
  });
});
