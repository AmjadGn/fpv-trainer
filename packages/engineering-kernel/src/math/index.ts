/** Deterministic numeric utilities — no locale, no Math.random. */

export const QUANTIZE_SCALE = 1e9;

/** Stable float quantization for canonical serialization / fingerprints. */
export function quantize(n: number, scale = QUANTIZE_SCALE): number {
  if (!Number.isFinite(n)) {
    return n;
  }
  return Math.round(n * scale) / scale;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function isFinitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

export function isFiniteNonNegative(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

export function assertFinite(n: number, label: string): number {
  if (!Number.isFinite(n)) {
    throw new Error(`${label} is not finite: ${n}`);
  }
  return n;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total;
}

export function stableSortByKey<T>(
  items: readonly T[],
  key: (item: T) => string,
): T[] {
  return [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}
