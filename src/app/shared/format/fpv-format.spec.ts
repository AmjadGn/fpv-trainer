import { describe, expect, it } from 'vitest';
import {
  formatCacheAge,
  formatDeltaSeconds,
  formatDuration,
  formatRaceTime,
  formatRaceTimeMs,
  formatRank,
  formatWind,
  formatXp,
} from './fpv-format';

describe('fpv-format', () => {
  it('formats race times', () => {
    expect(formatRaceTime(42.82)).toBe('00:42.82');
    expect(formatRaceTime(null)).toBe('--:--.--');
    expect(formatRaceTimeMs(42820)).toBe('00:42.82');
  });

  it('formats deltas with visible signs', () => {
    expect(formatDeltaSeconds(1.24)).toBe('+1.24 s');
    expect(formatDeltaSeconds(-0.38)).toBe('−0.38 s');
  });

  it('formats duration, rank, xp, and wind', () => {
    expect(formatDuration(134)).toBe('2m 14s');
    expect(formatDuration(11520)).toBe('3h 12m');
    expect(formatRank(42)).toBe('#42');
    expect(formatXp(1250)).toContain('1');
    expect(formatXp(1250)).toContain('XP');
    expect(formatWind(4.2)).toBe('4.2 m/s');
  });

  it('formats cache age', () => {
    const now = 1_000_000;
    expect(formatCacheAge(now - 18 * 60_000, now)).toBe('Last updated 18 minutes ago');
  });
});
