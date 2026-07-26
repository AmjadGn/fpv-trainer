import type { Quat, Vec3 } from '../../flight/models/flight-state.model';
import {
  bodyForwardWorld,
  rotateVecByQuatAlloc,
} from '../../flight/utils/quat-math';

/**
 * Pure render/camera frame helpers — no Three.js dependency.
 * Used by unit tests and optional HUD diagnostics.
 */

export interface RenderFrameSyncSample {
  physicsQuaternion: Quat;
  modelQuaternion: Quat;
  physicsForward: Vec3;
  modelForward: Vec3;
  /** Camera look direction in world space (unit). */
  cameraForward: Vec3;
  /** FPV mount offset along body axes before world transform. */
  fpvLocalOffset: Vec3;
  cameraPosition: Vec3;
  modelPosition: Vec3;
}

export function buildRenderFrameSync(options: {
  physicsQuaternion: Quat;
  modelQuaternion: Quat;
  modelPosition: Vec3;
  /** Camera world forward (already includes mount tilt if applied). */
  cameraForward: Vec3;
  cameraPosition: Vec3;
  fpvLocalOffset?: Vec3;
}): RenderFrameSyncSample {
  return {
    physicsQuaternion: { ...options.physicsQuaternion },
    modelQuaternion: { ...options.modelQuaternion },
    physicsForward: bodyForwardWorld(options.physicsQuaternion),
    modelForward: bodyForwardWorld(options.modelQuaternion),
    cameraForward: { ...options.cameraForward },
    fpvLocalOffset: options.fpvLocalOffset
      ? { ...options.fpvLocalOffset }
      : { x: 0, y: 0.12, z: -0.18 },
    cameraPosition: { ...options.cameraPosition },
    modelPosition: { ...options.modelPosition },
  };
}

/** Exact quaternion copy check (authoritative → model). */
export function quaternionsMatch(a: Quat, b: Quat, eps = 1e-9): boolean {
  const same =
    Math.abs(a.x - b.x) <= eps &&
    Math.abs(a.y - b.y) <= eps &&
    Math.abs(a.z - b.z) <= eps &&
    Math.abs(a.w - b.w) <= eps;
  const neg =
    Math.abs(a.x + b.x) <= eps &&
    Math.abs(a.y + b.y) <= eps &&
    Math.abs(a.z + b.z) <= eps &&
    Math.abs(a.w + b.w) <= eps;
  return same || neg;
}

export function vecDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * FPV look direction from body quaternion + pitch-up tilt about body right.
 * Mirrors three-renderer updateCamera FPV path without Three.js.
 */
export function fpvLookDirection(
  orientation: Quat,
  tiltRad: number,
): Vec3 {
  const forward = bodyForwardWorld(orientation);
  const up = rotateVecByQuatAlloc(0, 1, 0, orientation);
  const c = Math.cos(tiltRad);
  const s = Math.sin(tiltRad);
  const x = forward.x * c + up.x * s;
  const y = forward.y * c + up.y * s;
  const z = forward.z * c + up.z * s;
  const mag = Math.hypot(x, y, z) || 1;
  return { x: x / mag, y: y / mag, z: z / mag };
}

/**
 * Chase camera local offset transformed by aircraft orientation (body → world).
 */
export function chaseOffsetWorld(
  orientation: Quat,
  localOffset: Vec3,
): Vec3 {
  return rotateVecByQuatAlloc(
    localOffset.x,
    localOffset.y,
    localOffset.z,
    orientation,
  );
}
