import type { Pose, Quat, Vec3 } from '@fpv/simulation-contracts';

import {
  bodyForwardWorld,
  bodyUpWorld,
  rotateVecByQuatAlloc,
} from '../../flight/utils/quat-math';
import { fpvLookDirection } from '../../rendering/utils/flight-frame-sync';
import type { ResolvedFlightCameraRig } from '../models/resolved-flight-camera-rig';

/**
 * Pure body→world camera pose from aircraft pose + resolved local mount.
 * Excludes shake, look lag, impact displacement, and cosmetic FOV.
 */

export interface AuthoritativeFlightCameraWorldSnapshot {
  readonly worldPose: Pose;
  readonly forwardWorld: Vec3;
  readonly upWorld: Vec3;
  readonly localMountPosition: Vec3;
  readonly localCameraTiltRad: number;
  readonly baseVerticalFovDegrees: number;
  readonly missionCaptureAspectRatio: number;
  readonly nearMeters: number;
  readonly farMeters: number;
  readonly cosmeticEffectsExcluded: true;
}

function normalize(v: Vec3): Vec3 {
  const mag = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / mag, y: v.y / mag, z: v.z / mag };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Build a body→world quaternion whose local −Z looks along `forward` and
 * local +Y aligns with `up` (re-orthogonalized).
 */
export function quatFromForwardUp(forward: Vec3, up: Vec3): Quat {
  const f = normalize(forward);
  const r = normalize(cross(f, normalize(up)));
  // Recompute up for orthonormality: up = right × forward? 
  // Camera local: +X right, +Y up, −Z forward ⇒ forward = −Z.
  // Basis columns (body axes in world): right, up, -forward (Z axis).
  const u = normalize(cross(r, f));
  const z = { x: -f.x, y: -f.y, z: -f.z };

  // Rotation matrix columns = body axes in world.
  const m00 = r.x;
  const m01 = u.x;
  const m02 = z.x;
  const m10 = r.y;
  const m11 = u.y;
  const m12 = z.y;
  const m20 = r.z;
  const m21 = u.z;
  const m22 = z.z;

  const trace = m00 + m11 + m22;
  let x: number;
  let y: number;
  let zq: number;
  let w: number;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    zq = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    zq = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    zq = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    zq = 0.25 * s;
  }
  const mag = Math.hypot(x, y, zq, w) || 1;
  return { x: x / mag, y: y / mag, z: zq / mag, w: w / mag };
}

/**
 * Legacy-compatible FPV camera world position (matches Three.js mount path).
 */
export function computeLegacyFpvCameraPosition(
  aircraftPosition: Vec3,
  aircraftOrientation: Quat,
  localMount: Vec3,
): Vec3 {
  const offset = rotateVecByQuatAlloc(
    localMount.x,
    localMount.y,
    localMount.z,
    aircraftOrientation,
  );
  return {
    x: aircraftPosition.x + offset.x,
    y: aircraftPosition.y + offset.y,
    z: aircraftPosition.z + offset.z,
  };
}

export function resolveAuthoritativeFlightCameraWorldSnapshot(
  aircraftPosition: Vec3,
  aircraftOrientation: Quat,
  rig: ResolvedFlightCameraRig,
): AuthoritativeFlightCameraWorldSnapshot {
  const position = computeLegacyFpvCameraPosition(
    aircraftPosition,
    aircraftOrientation,
    rig.localMountPosition,
  );
  const forwardWorld = fpvLookDirection(aircraftOrientation, rig.localCameraTiltRad);
  const upWorld = bodyUpWorld(aircraftOrientation);
  const orientation = quatFromForwardUp(forwardWorld, upWorld);

  return {
    worldPose: { position, orientation },
    forwardWorld,
    upWorld,
    localMountPosition: { ...rig.localMountPosition },
    localCameraTiltRad: rig.localCameraTiltRad,
    baseVerticalFovDegrees: rig.baseVerticalFovDegrees,
    missionCaptureAspectRatio: rig.missionCaptureAspectRatio,
    nearMeters: rig.nearMeters,
    farMeters: rig.farMeters,
    cosmeticEffectsExcluded: true,
  };
}

/** Expose body forward for tests without importing renderer helpers. */
export function aircraftBodyForwardWorld(orientation: Quat): Vec3 {
  return bodyForwardWorld(orientation);
}
