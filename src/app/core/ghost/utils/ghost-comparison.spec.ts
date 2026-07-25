import { describe, expect, it } from 'vitest';

import type { GhostGateSplit } from '../models/ghost.models';
import {
  computeExactGateSplitDeltaSeconds,
  computeGhostComparison,
  formatGhostDeltaSeconds,
} from './ghost-comparison';

const splits: GhostGateSplit[] = [
  { gateIndex: 0, timeMs: 1000 },
  { gateIndex: 1, timeMs: 2000 },
  { gateIndex: 2, timeMs: 3000 },
];

describe('ghost comparison', () => {
  it('computes exact gate split delta ahead / behind / equal', () => {
    expect(computeExactGateSplitDeltaSeconds(800, splits, 0)).toBeCloseTo(
      -0.2,
      5,
    );
    expect(computeExactGateSplitDeltaSeconds(1200, splits, 0)).toBeCloseTo(
      0.2,
      5,
    );
    expect(computeExactGateSplitDeltaSeconds(1000, splits, 0)).toBeCloseTo(
      0,
      5,
    );
  });

  it('returns null for missing split', () => {
    expect(computeExactGateSplitDeltaSeconds(1000, splits, 99)).toBeNull();
    expect(computeExactGateSplitDeltaSeconds(Number.NaN, splits, 0)).toBeNull();
  });

  it('computes finite comparison snapshot', () => {
    const snapshot = computeGhostComparison({
      playerElapsedMs: 900,
      playerGateIndex: 1,
      playerCompletedGates: 1,
      ghostGateIndex: 0,
      ghostCompletedGates: 0,
      ghostSplits: splits,
      previousSmoothedDelta: null,
      distanceMeters: 4.5,
      lastExactSplitDeltaSeconds: -0.1,
      lastExactSplitGateIndex: 0,
      useApproximateLive: true,
    });
    expect(snapshot.aheadState).toBe('ahead');
    expect(snapshot.splitDeltaSeconds).toBeCloseTo(-0.1, 5);
    expect(Number.isFinite(snapshot.progressDelta)).toBe(true);
    expect(snapshot.smoothedDeltaSeconds).not.toBeNull();
    expect(Number.isFinite(snapshot.smoothedDeltaSeconds!)).toBe(true);
    expect(snapshot.distanceMeters).toBe(4.5);
  });

  it('formats ghost delta seconds', () => {
    expect(formatGhostDeltaSeconds(null)).toBe('—');
    expect(formatGhostDeltaSeconds(Number.NaN)).toBe('—');
    expect(formatGhostDeltaSeconds(0)).toBe('0.00 s');
    expect(formatGhostDeltaSeconds(-1.234)).toBe('−1.23 s');
    expect(formatGhostDeltaSeconds(2.5)).toBe('+2.50 s');
  });
});
