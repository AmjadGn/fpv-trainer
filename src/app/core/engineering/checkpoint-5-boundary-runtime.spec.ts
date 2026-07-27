import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FIXED_STEP_SECONDS,
  DEFAULT_OUT_OF_BOUNDS_GRACE_TICKS,
  MissionBoundaryRuntime,
  OUT_OF_BOUNDS_GRACE_SECONDS,
  authoredGraceTicksToSeconds,
  graceTicksFromFixedStep,
} from '../mission/services/mission-boundary-runtime';
import type { BoundaryShape } from '@fpv/location-domain';

const BOX: BoundaryShape = {
  kind: 'aabb',
  aabb: {
    min: { x: -10, y: 0, z: -10 },
    max: { x: 10, y: 50, z: 10 },
  },
};

const INSIDE = { x: 0, y: 5, z: 0 };
const OUTSIDE = { x: 100, y: 5, z: 0 };
const SESSION = 3;

describe('Checkpoint 5 — boundary grace conversion', () => {
  it('converts 3 seconds with ceiling at 60 Hz, 120 Hz, and 30 Hz', () => {
    expect(graceTicksFromFixedStep(OUT_OF_BOUNDS_GRACE_SECONDS, 1 / 60)).toBe(180);
    expect(graceTicksFromFixedStep(OUT_OF_BOUNDS_GRACE_SECONDS, 1 / 120)).toBe(360);
    expect(graceTicksFromFixedStep(OUT_OF_BOUNDS_GRACE_SECONDS, 1 / 30)).toBe(90);
    expect(DEFAULT_OUT_OF_BOUNDS_GRACE_TICKS).toBe(180);
    expect(authoredGraceTicksToSeconds(180)).toBe(3);
  });

  it('ceilings non-divisible fixed steps so grace is never shorter than 3 seconds', () => {
    // 1/90 ≈ 0.0111… → 3 / (1/90) = 270 exactly
    expect(graceTicksFromFixedStep(3, 1 / 90)).toBe(270);
    // 0.017 seconds/step → 3/0.017 ≈ 176.47 → ceil 177
    expect(graceTicksFromFixedStep(3, 0.017)).toBe(177);
    expect(177 * 0.017).toBeGreaterThanOrEqual(3);
  });
});

describe('Checkpoint 5 — MissionBoundaryRuntime', () => {
  function configured(fixedStepSeconds = DEFAULT_FIXED_STEP_SECONDS): MissionBoundaryRuntime {
    const runtime = new MissionBoundaryRuntime();
    runtime.configure({
      shape: BOX,
      graceSeconds: OUT_OF_BOUNDS_GRACE_SECONDS,
      fixedStepSeconds,
      sessionGeneration: SESSION,
    });
    return runtime;
  }

  it('expires exactly once after graceTicks + 1 contiguous out-of-bounds ticks at 60 Hz', () => {
    const runtime = configured(1 / 60);
    expect(runtime.state().graceTicks).toBe(180);

    expect(runtime.observe(1, OUTSIDE, SESSION)).toBe('countdown-started');
    for (let tick = 2; tick <= 180; tick += 1) {
      expect(runtime.observe(tick, OUTSIDE, SESSION)).toBe('countdown-advanced');
    }
    expect(runtime.observe(181, OUTSIDE, SESSION)).toBe('expired');
    expect(runtime.observe(182, OUTSIDE, SESSION)).toBe('already-expired');
    expect(runtime.state().expired).toBe(true);
  });

  it('requires 361 contiguous out-of-bounds ticks at 120 Hz before expiry', () => {
    const runtime = configured(1 / 120);
    expect(runtime.state().graceTicks).toBe(360);
    runtime.observe(0, OUTSIDE, SESSION);
    for (let tick = 1; tick < 360; tick += 1) {
      runtime.observe(tick, OUTSIDE, SESSION);
    }
    expect(runtime.observe(360, OUTSIDE, SESSION)).toBe('expired');
  });

  it('resets the continuous count on re-entry', () => {
    const runtime = configured();
    runtime.observe(1, OUTSIDE, SESSION);
    runtime.observe(2, OUTSIDE, SESSION);
    expect(runtime.state().continuousOutOfBoundsTicks).toBe(2);
    expect(runtime.observe(3, INSIDE, SESSION)).toBe('countdown-reset');
    expect(runtime.state().outOfBounds).toBe(false);
    expect(runtime.state().continuousOutOfBoundsTicks).toBe(0);
  });

  it('resets on a tick discontinuity (pause / gap)', () => {
    const runtime = configured();
    runtime.observe(1, OUTSIDE, SESSION);
    runtime.observe(2, OUTSIDE, SESSION);
    // Pause: ticks 3..50 are never observed.
    expect(runtime.observe(51, OUTSIDE, SESSION)).toBe('countdown-started');
    expect(runtime.state().continuousOutOfBoundsTicks).toBe(1);
  });

  it('recomputes grace ticks and resets when the fixed step changes', () => {
    const runtime = configured(1 / 60);
    runtime.observe(1, OUTSIDE, SESSION);
    runtime.observe(2, OUTSIDE, SESSION);
    expect(runtime.state().continuousOutOfBoundsTicks).toBe(2);

    runtime.updateFixedStepSeconds(1 / 120);
    expect(runtime.state().graceTicks).toBe(360);
    expect(runtime.state().continuousOutOfBoundsTicks).toBe(0);
    expect(runtime.state().fixedStepSeconds).toBeCloseTo(1 / 120);
  });

  it('derives remainingSeconds from remainingTicks and fixedStepSeconds', () => {
    const runtime = configured(1 / 60);
    runtime.observe(1, OUTSIDE, SESSION);
    const state = runtime.state();
    expect(state.remainingTicks).toBe(179);
    expect(state.remainingSeconds).toBeCloseTo(179 / 60);
  });

  it('rejects stale session generations', () => {
    const runtime = configured();
    expect(runtime.observe(1, OUTSIDE, SESSION + 1)).toBe('stale-session');
  });
});
