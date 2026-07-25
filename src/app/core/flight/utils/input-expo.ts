/**
 * Pure input-curve helpers for flight feel tuning.
 *
 * Expo amount: 0 = linear, 1 = full cubic. Intermediate blends.
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Centered stick expo for yaw / pitch / roll (-1..1).
 * Preserves sign; maps through (1-e)*|x| + e*|x|³.
 */
export function applyCenteredExpo(value: number, expo: number): number {
  const x = clamp(value, -1, 1);
  const e = clamp(expo, 0, 1);
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  return sign * ((1 - e) * abs + e * abs * abs * abs);
}

/**
 * Throttle expo for 0..1 thrust command.
 * Softens the low end while retaining full authority at 1.
 */
export function applyThrottleExpo(throttle: number, expo: number): number {
  const t = clamp(throttle, 0, 1);
  const e = clamp(expo, 0, 1);
  return (1 - e) * t + e * t * t * t;
}

/**
 * Throttle curve with a tunable midpoint (hover region).
 * Maps 0..midpoint and midpoint..1 with expo on each half.
 */
export function applyThrottleCurve(
  throttle: number,
  expo: number,
  midpoint: number,
): number {
  const t = clamp(throttle, 0, 1);
  const mid = clamp(midpoint, 0.05, 0.95);
  const e = clamp(expo, 0, 1);

  if (t <= mid) {
    const u = t / mid;
    const curved = (1 - e) * u + e * u * u * u;
    return curved * mid;
  }

  const u = (t - mid) / (1 - mid);
  const curved = (1 - e) * u + e * u * u * u;
  return mid + curved * (1 - mid);
}
