import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RATE_PROFILE_ID,
  RATE_PROFILES,
  applyProfileExpo,
  isRateProfileId,
} from '../config/rate-profiles';
import {
  applyCenteredExpo,
  applyThrottleCurve,
  applyThrottleExpo,
} from '../utils/input-expo';

describe('input expo', () => {
  it('centered expo preserves sign and endpoints', () => {
    expect(applyCenteredExpo(0, 0.5)).toBe(0);
    expect(applyCenteredExpo(1, 0.5)).toBe(1);
    expect(applyCenteredExpo(-1, 0.5)).toBe(-1);
    expect(applyCenteredExpo(0.5, 0)).toBeCloseTo(0.5);
    expect(Math.abs(applyCenteredExpo(0.5, 0.6))).toBeLessThan(0.5);
    expect(applyCenteredExpo(-0.5, 0.6)).toBeLessThan(0);
  });

  it('throttle expo maps 0..1 and softens mid values', () => {
    expect(applyThrottleExpo(0, 0.4)).toBe(0);
    expect(applyThrottleExpo(1, 0.4)).toBe(1);
    expect(applyThrottleExpo(0.5, 0.5)).toBeLessThan(0.5);
  });

  it('throttle curve respects midpoint', () => {
    expect(applyThrottleCurve(0.5, 0, 0.5)).toBeCloseTo(0.5);
    expect(applyThrottleCurve(0, 0.3, 0.5)).toBe(0);
    expect(applyThrottleCurve(1, 0.3, 0.5)).toBe(1);
  });
});

describe('rate profiles', () => {
  it('includes beginner, normal, and acro', () => {
    expect(RATE_PROFILES.beginner.maxPitchRate).toBeLessThan(
      RATE_PROFILES.normal.maxPitchRate,
    );
    expect(RATE_PROFILES.normal.maxPitchRate).toBeLessThan(
      RATE_PROFILES.acro.maxPitchRate,
    );
    expect(DEFAULT_RATE_PROFILE_ID).toBe('beginner');
    expect(isRateProfileId('beginner')).toBe(true);
    expect(isRateProfileId('nope')).toBe(false);
  });

  it('applyProfileExpo uses profile curves', () => {
    const shaped = applyProfileExpo(
      { throttle: 0.5, yaw: 0.5, pitch: -0.5, roll: 1 },
      RATE_PROFILES.beginner,
    );
    expect(shaped.roll).toBe(1);
    expect(Math.abs(shaped.yaw)).toBeLessThan(0.5);
    expect(shaped.pitch).toBeLessThan(0);
  });
});
