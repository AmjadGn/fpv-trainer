/**
 * Deterministic smooth noise helpers for wind fields.
 * No Math.random() — safe inside the fixed simulation timestep.
 */

function hashInt(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489917);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 1D value noise in [0, 1]. */
export function valueNoise1D(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = fade(x - i);
  const a = hashInt(i + seed * 374761393);
  const b = hashInt(i + 1 + seed * 374761393);
  return lerp(a, b, f);
}

/** 3D value noise in [0, 1] (x, y=time-ish, z). */
export function valueNoise3D(
  x: number,
  y: number,
  z: number,
  seed: number,
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const fz = fade(z - z0);

  const n = (ix: number, iy: number, iz: number): number =>
    hashInt(
      ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed * 1013904223,
    );

  const n000 = n(x0, y0, z0);
  const n100 = n(x0 + 1, y0, z0);
  const n010 = n(x0, y0 + 1, z0);
  const n110 = n(x0 + 1, y0 + 1, z0);
  const n001 = n(x0, y0, z0 + 1);
  const n101 = n(x0 + 1, y0, z0 + 1);
  const n011 = n(x0, y0 + 1, z0 + 1);
  const n111 = n(x0 + 1, y0 + 1, z0 + 1);

  const x00 = lerp(n000, n100, fx);
  const x10 = lerp(n010, n110, fx);
  const x01 = lerp(n001, n101, fx);
  const x11 = lerp(n011, n111, fx);
  const y0v = lerp(x00, x10, fy);
  const y1v = lerp(x01, x11, fy);
  return lerp(y0v, y1v, fz);
}

/** Layered sinusoidal gust envelope in ~[0, 1]. */
export function gustEnvelope(
  timeSeconds: number,
  frequency: number,
  seed: number,
): number {
  if (!(frequency > 0) || !Number.isFinite(frequency)) {
    return 0;
  }
  const phase = hashInt(seed) * Math.PI * 2;
  const slow = 0.5 + 0.5 * Math.sin(timeSeconds * frequency * Math.PI * 2 + phase);
  const mid =
    0.5 +
    0.5 *
      Math.sin(
        timeSeconds * frequency * 1.73 * Math.PI * 2 + phase * 1.7 + 1.1,
      );
  const noise = valueNoise1D(timeSeconds * frequency * 0.85, seed + 19);
  // Soft peaks — avoid constant full gust.
  const mixed = slow * 0.55 + mid * 0.25 + noise * 0.2;
  return Math.min(1, Math.max(0, mixed * mixed * 1.15));
}
