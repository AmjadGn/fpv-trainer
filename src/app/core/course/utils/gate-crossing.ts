import type { Quat, Vec3 } from '../../flight/models/flight-state.model';
import type { CourseGate } from '../models/course.model';

export type GateCrossingResult =
  | { type: 'none' }
  | { type: 'valid' }
  | { type: 'missed' }
  | { type: 'wrongDirection' };

/**
 * Detect whether the movement segment from previous → current crosses the
 * gate opening plane with a valid forward pass.
 *
 * Gate local frame: +X right, +Y up, -Z correct crossing direction.
 * Opening is the local XY rectangle at z = 0.
 */
export function detectGateCrossing(
  gate: CourseGate,
  previous: Vec3,
  current: Vec3,
): GateCrossingResult {
  const prevLocal = worldToGateLocal(gate.position, gate.rotation, previous);
  const currLocal = worldToGateLocal(gate.position, gate.rotation, current);

  const z0 = prevLocal.z;
  const z1 = currLocal.z;

  // No plane crossing this step.
  if (z0 === z1 || z0 * z1 > 0) {
    // Treat exact landing on the plane as a crossing if we moved.
    if (!(z0 === 0 && z1 !== 0) && !(z1 === 0 && z0 !== 0)) {
      return { type: 'none' };
    }
  }

  // Must cross through z = 0 between the samples (inclusive endpoints).
  if (!crossesZero(z0, z1)) {
    return { type: 'none' };
  }

  const t = planeHitT(z0, z1);
  const hitX = prevLocal.x + (currLocal.x - prevLocal.x) * t;
  const hitY = prevLocal.y + (currLocal.y - prevLocal.y) * t;

  const halfW = gate.width * 0.5 + gate.triggerPadding;
  const halfH = gate.height * 0.5 + gate.triggerPadding;
  const insideOpening = Math.abs(hitX) <= halfW && Math.abs(hitY) <= halfH;

  // Forward crossing: local Z goes from + toward - (through the front).
  const forward = z0 > z1;

  if (!forward) {
    return { type: 'wrongDirection' };
  }

  if (!insideOpening) {
    return { type: 'missed' };
  }

  return { type: 'valid' };
}

/** True while the point lies inside the padded gate trigger volume. */
export function isInsideGateTrigger(gate: CourseGate, point: Vec3): boolean {
  const local = worldToGateLocal(gate.position, gate.rotation, point);
  const halfW = gate.width * 0.5 + gate.triggerPadding;
  const halfH = gate.height * 0.5 + gate.triggerPadding;
  const halfD = gate.depth * 0.5 + gate.triggerPadding;
  return (
    Math.abs(local.x) <= halfW &&
    Math.abs(local.y) <= halfH &&
    Math.abs(local.z) <= halfD
  );
}

export function worldToGateLocal(
  gatePosition: Vec3,
  gateRotation: Quat,
  world: Vec3,
): Vec3 {
  const dx = world.x - gatePosition.x;
  const dy = world.y - gatePosition.y;
  const dz = world.z - gatePosition.z;
  return rotateByConjugate(dx, dy, dz, gateRotation);
}

function crossesZero(a: number, b: number): boolean {
  return a === 0 || b === 0 || a * b < 0;
}

function planeHitT(z0: number, z1: number): number {
  const denom = z0 - z1;
  if (Math.abs(denom) < 1e-12) {
    return 0;
  }
  return z0 / denom;
}

/** Rotate vector by the conjugate of a unit quaternion (world → local). */
function rotateByConjugate(
  vx: number,
  vy: number,
  vz: number,
  q: Quat,
): Vec3 {
  const x = -q.x;
  const y = -q.y;
  const z = -q.z;
  const w = q.w;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return {
    x: vx + w * tx + (y * tz - z * ty),
    y: vy + w * ty + (z * tx - x * tz),
    z: vz + w * tz + (x * ty - y * tx),
  };
}
