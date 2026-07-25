import type { ReplayFrame, ReplayQuat, ReplayVec3 } from '../models/replay.model';

export interface InterpolatedReplaySample {
  timestampMs: number;
  position: ReplayVec3;
  orientation: ReplayQuat;
  linearVelocity: ReplayVec3;
  angularVelocity: ReplayVec3;
  throttle: number;
  armed: boolean;
  crashed: boolean;
  currentGateIndex: number;
  /** Fraction between frameA and frameB. */
  alpha: number;
  frameIndex: number;
}

const scratchPos: ReplayVec3 = { x: 0, y: 0, z: 0 };
const scratchVel: ReplayVec3 = { x: 0, y: 0, z: 0 };
const scratchAng: ReplayVec3 = { x: 0, y: 0, z: 0 };
const scratchQuat: ReplayQuat = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Sample replay at timeMs with linear position/velocity and quat slerp.
 * Does not mutate recorded frames.
 */
export function sampleReplayAt(
  frames: readonly ReplayFrame[],
  timeMs: number,
  out?: InterpolatedReplaySample,
): InterpolatedReplaySample {
  const result =
    out ??
    ({
      timestampMs: 0,
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      throttle: 0,
      armed: false,
      crashed: false,
      currentGateIndex: 0,
      alpha: 0,
      frameIndex: 0,
    } satisfies InterpolatedReplaySample);

  if (frames.length === 0) {
    return result;
  }

  const t = Math.max(0, timeMs);
  if (t <= frames[0].timestampMs) {
    return copyFrame(frames[0], 0, 0, result);
  }
  const last = frames[frames.length - 1];
  if (t >= last.timestampMs) {
    return copyFrame(last, frames.length - 1, 1, result);
  }

  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].timestampMs <= t) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = frames[lo];
  const b = frames[hi];
  const span = Math.max(1e-6, b.timestampMs - a.timestampMs);
  const alpha = (t - a.timestampMs) / span;

  lerpVec(a.position, b.position, alpha, scratchPos);
  lerpVec(a.linearVelocity, b.linearVelocity, alpha, scratchVel);
  lerpVec(a.angularVelocity, b.angularVelocity, alpha, scratchAng);
  slerpQuat(a.orientation, b.orientation, alpha, scratchQuat);

  result.timestampMs = t;
  result.position.x = scratchPos.x;
  result.position.y = scratchPos.y;
  result.position.z = scratchPos.z;
  result.linearVelocity.x = scratchVel.x;
  result.linearVelocity.y = scratchVel.y;
  result.linearVelocity.z = scratchVel.z;
  result.angularVelocity.x = scratchAng.x;
  result.angularVelocity.y = scratchAng.y;
  result.angularVelocity.z = scratchAng.z;
  result.orientation.x = scratchQuat.x;
  result.orientation.y = scratchQuat.y;
  result.orientation.z = scratchQuat.z;
  result.orientation.w = scratchQuat.w;
  result.throttle = a.throttle + (b.throttle - a.throttle) * alpha;
  result.armed = alpha < 0.5 ? a.armed : b.armed;
  result.crashed = alpha < 0.5 ? a.crashed : b.crashed;
  result.currentGateIndex =
    alpha < 0.5 ? a.currentGateIndex : b.currentGateIndex;
  result.alpha = alpha;
  result.frameIndex = lo;
  return result;
}

function copyFrame(
  frame: ReplayFrame,
  index: number,
  alpha: number,
  out: InterpolatedReplaySample,
): InterpolatedReplaySample {
  out.timestampMs = frame.timestampMs;
  out.position.x = frame.position.x;
  out.position.y = frame.position.y;
  out.position.z = frame.position.z;
  out.orientation.x = frame.orientation.x;
  out.orientation.y = frame.orientation.y;
  out.orientation.z = frame.orientation.z;
  out.orientation.w = frame.orientation.w;
  out.linearVelocity.x = frame.linearVelocity.x;
  out.linearVelocity.y = frame.linearVelocity.y;
  out.linearVelocity.z = frame.linearVelocity.z;
  out.angularVelocity.x = frame.angularVelocity.x;
  out.angularVelocity.y = frame.angularVelocity.y;
  out.angularVelocity.z = frame.angularVelocity.z;
  out.throttle = frame.throttle;
  out.armed = frame.armed;
  out.crashed = frame.crashed;
  out.currentGateIndex = frame.currentGateIndex;
  out.alpha = alpha;
  out.frameIndex = index;
  return out;
}

function lerpVec(
  a: ReplayVec3,
  b: ReplayVec3,
  t: number,
  out: ReplayVec3,
): void {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
}

function slerpQuat(
  a: ReplayQuat,
  b: ReplayQuat,
  t: number,
  out: ReplayQuat,
): void {
  let ax = a.x;
  let ay = a.y;
  let az = a.z;
  let aw = a.w;
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;

  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    dot = -dot;
  }

  if (dot > 0.9995) {
    out.x = ax + (bx - ax) * t;
    out.y = ay + (by - ay) * t;
    out.z = az + (bz - az) * t;
    out.w = aw + (bw - aw) * t;
    normalizeQuat(out);
    return;
  }

  const theta0 = Math.acos(Math.min(1, Math.max(-1, dot)));
  const theta = theta0 * t;
  const sinTheta0 = Math.sin(theta0);
  const sinTheta = Math.sin(theta);
  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;

  out.x = s0 * ax + s1 * bx;
  out.y = s0 * ay + s1 * by;
  out.z = s0 * az + s1 * bz;
  out.w = s0 * aw + s1 * bw;
}

function normalizeQuat(q: ReplayQuat): void {
  const len = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  q.x /= len;
  q.y /= len;
  q.z /= len;
  q.w /= len;
}
