import { describe, expect, it } from 'vitest';

import { SeededRandom, mixSeed } from './seeded-random';

describe('SeededRandom', () => {
  it('same seed produces the same sequence', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    for (let i = 0; i < 32; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('different seeds produce different sequences', () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('generated values remain in expected ranges', () => {
    const rng = new SeededRandom(99);
    for (let i = 0; i < 100; i++) {
      const n = rng.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      const r = rng.range(-3, 5);
      expect(r).toBeGreaterThanOrEqual(-3);
      expect(r).toBeLessThan(5);
      const iv = rng.int(2, 7);
      expect(iv).toBeGreaterThanOrEqual(2);
      expect(iv).toBeLessThanOrEqual(7);
    }
  });

  it('mixSeed is stable', () => {
    expect(mixSeed(10, 20)).toBe(mixSeed(10, 20));
    expect(mixSeed(10, 20)).not.toBe(mixSeed(10, 21));
  });
});
