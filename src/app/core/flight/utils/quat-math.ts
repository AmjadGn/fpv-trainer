import type { Quat, Vec3 } from '../models/flight-state.model';

/**
 * Shared quaternion helpers for flight orientation.
 *
 * Proven conventions (see quat-math.spec.ts — analytic, not circular):
 * - Stored q maps body → world (v_world = q ⊗ v_body ⊗ q*).
 * - rotateVecByQuat implements q ⊗ v ⊗ q* (not the conjugate form).
 * - Stick rates (pitch, yaw, roll) are body-local about documented axes.
 * - Positive pitch = nose down about body +X ⇒ ω_x = −pitch.
 * - Positive yaw   = turn right about body +Y ⇒ ω_y = −yaw.
 * - Positive roll  = bank right about body forward (−Z) ⇒ ω_z = −roll.
 * - Body-rate integration: dq/dt = ½ q ⊗ ω_body  (right-multiply / body frame).
 */

export function normalizeQuat(q: Quat): void {
  const mag = Math.hypot(q.x, q.y, q.z, q.w);
  if (mag < 1e-12) {
    q.x = 0;
    q.y = 0;
    q.z = 0;
    q.w = 1;
    return;
  }
  const inv = 1 / mag;
  q.x *= inv;
  q.y *= inv;
  q.z *= inv;
  q.w *= inv;
}

export function quatLength(q: Quat): number {
  return Math.hypot(q.x, q.y, q.z, q.w);
}

/** Hamilton product c = a ⊗ b. */
export function hamiltonProduct(a: Quat, b: Quat, out: Quat): void {
  out.x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  out.y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  out.z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  out.w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
}

export function hamiltonProductAlloc(a: Quat, b: Quat): Quat {
  const out: Quat = { x: 0, y: 0, z: 0, w: 1 };
  hamiltonProduct(a, b, out);
  return out;
}

/**
 * Rotate body vector by unit body→world quaternion into world space.
 * Implements v' = q ⊗ v ⊗ q* via the standard cross-product form.
 */
export function rotateVecByQuat(
  vx: number,
  vy: number,
  vz: number,
  q: Quat,
  out: Vec3,
): void {
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  out.x = vx + q.w * tx + (q.y * tz - q.z * ty);
  out.y = vy + q.w * ty + (q.z * tx - q.x * tz);
  out.z = vz + q.w * tz + (q.x * ty - q.y * tx);
}

export function rotateVecByQuatAlloc(
  vx: number,
  vy: number,
  vz: number,
  q: Quat,
): Vec3 {
  const out: Vec3 = { x: 0, y: 0, z: 0 };
  rotateVecByQuat(vx, vy, vz, q, out);
  return out;
}

/** Map documented stick rates (rad/s) to body angular-velocity components. */
export function bodyRatesToOmega(
  pitch: number,
  yaw: number,
  roll: number,
): { wx: number; wy: number; wz: number } {
  return {
    wx: -pitch,
    wy: -yaw,
    wz: -roll,
  };
}

/**
 * Integrate body-frame pitch/yaw/roll rates into orientation.
 * q maps body → world; uses dq/dt = ½ q ⊗ ω_body.
 */
export function integrateBodyRates(
  q: Quat,
  pitch: number,
  yaw: number,
  roll: number,
  dt: number,
  scratch: Quat,
): void {
  const { wx, wy, wz } = bodyRatesToOmega(pitch, yaw, roll);
  const halfDt = 0.5 * dt;

  // ½ Δt · (q ⊗ ω) with ω = (wx, wy, wz, 0)
  scratch.x = halfDt * (q.w * wx + q.y * wz - q.z * wy);
  scratch.y = halfDt * (q.w * wy - q.x * wz + q.z * wx);
  scratch.z = halfDt * (q.w * wz + q.x * wy - q.y * wx);
  scratch.w = halfDt * (-q.x * wx - q.y * wy - q.z * wz);

  q.x += scratch.x;
  q.y += scratch.y;
  q.z += scratch.z;
  q.w += scratch.w;
  normalizeQuat(q);
}

/** Axis-angle unit quaternion about world/body axis (ax,ay,az) by angle rad. */
export function quatFromAxisAngle(
  ax: number,
  ay: number,
  az: number,
  angleRad: number,
): Quat {
  const len = Math.hypot(ax, ay, az);
  if (len < 1e-12) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  const half = angleRad * 0.5;
  const s = Math.sin(half) / len;
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(half) };
}

/**
 * World-space axis of the incremental rotation taking q0 → q1 when q is body→world.
 * Uses q_delta = q1 ⊗ q0* so the axis is expressed in world coordinates.
 */
export function worldRotationAxisBetween(q0: Quat, q1: Quat): Vec3 | null {
  const conj: Quat = { x: -q0.x, y: -q0.y, z: -q0.z, w: q0.w };
  const delta = hamiltonProductAlloc(q1, conj);
  if (delta.w < 0) {
    delta.x = -delta.x;
    delta.y = -delta.y;
    delta.z = -delta.z;
    delta.w = -delta.w;
  }
  const sinHalf = Math.hypot(delta.x, delta.y, delta.z);
  if (sinHalf < 1e-10) {
    return null;
  }
  const inv = 1 / sinHalf;
  return { x: delta.x * inv, y: delta.y * inv, z: delta.z * inv };
}

export function bodyForwardWorld(q: Quat, out?: Vec3): Vec3 {
  const target = out ?? { x: 0, y: 0, z: 0 };
  rotateVecByQuat(0, 0, -1, q, target);
  return target;
}

export function bodyRightWorld(q: Quat, out?: Vec3): Vec3 {
  const target = out ?? { x: 0, y: 0, z: 0 };
  rotateVecByQuat(1, 0, 0, q, target);
  return target;
}

export function bodyUpWorld(q: Quat, out?: Vec3): Vec3 {
  const target = out ?? { x: 0, y: 0, z: 0 };
  rotateVecByQuat(0, 1, 0, q, target);
  return target;
}

/**
 * Heading about world +Y: 0 when nose faces world −Z, positive when yawed right
 * (nose toward +X). Independent of Euler extraction order.
 */
export function headingYawRad(q: Quat): number {
  const f = bodyForwardWorld(q);
  return Math.atan2(f.x, -f.z);
}
