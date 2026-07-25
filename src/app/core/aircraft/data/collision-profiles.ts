import type { CollisionProfile, ColliderPartDef } from '../models/collision-profile.model';
import type { Vec3 } from '../../flight/models/flight-state.model';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

function arm(
  tag: string,
  x: number,
  z: number,
  yaw: number,
  he: Vec3,
): ColliderPartDef {
  return {
    kind: 'arm',
    shape: 'box',
    halfExtents: he,
    translation: v(x, 0, z),
    yaw,
    tag,
  };
}

function motor(tag: string, x: number, z: number, r: number, y = 0.02): ColliderPartDef {
  return {
    kind: 'motor',
    shape: 'sphere',
    radius: r,
    translation: v(x, y, z),
    tag,
  };
}

function ring(tag: string, x: number, z: number, r: number, hh: number): ColliderPartDef {
  return {
    kind: 'propRing',
    shape: 'cylinder',
    radius: r,
    halfHeight: hh,
    translation: v(x, 0.01, z),
    tag,
  };
}

/** AeroGuard 2 — body + prop rings + camera housing. */
export const COLLISION_AEROGUARD_2: CollisionProfile = {
  id: 'col-aeroguard-2',
  version: '1.0.0',
  queryRadius: 0.28,
  collisionScale: 1,
  damageMultiplier: 0.75,
  parts: [
    { kind: 'body', shape: 'box', halfExtents: v(0.08, 0.04, 0.09), translation: v(0, 0, 0), tag: 'body' },
    { kind: 'camera', shape: 'box', halfExtents: v(0.025, 0.02, 0.03), translation: v(0, -0.01, -0.1), tag: 'camera' },
    ring('ring-fl', 0.11, -0.11, 0.09, 0.012),
    ring('ring-fr', -0.11, -0.11, 0.09, 0.012),
    ring('ring-bl', 0.11, 0.11, 0.09, 0.012),
    ring('ring-br', -0.11, 0.11, 0.09, 0.012),
  ],
};

/** Velocity X — aero body + arms + motors + nose camera. */
export const COLLISION_VELOCITY_X: CollisionProfile = {
  id: 'col-velocity-x',
  version: '1.0.0',
  queryRadius: 0.42,
  collisionScale: 1,
  damageMultiplier: 1.25,
  parts: [
    { kind: 'body', shape: 'box', halfExtents: v(0.1, 0.045, 0.16), translation: v(0, 0, 0), tag: 'body' },
    { kind: 'battery', shape: 'box', halfExtents: v(0.06, 0.03, 0.08), translation: v(0, -0.02, 0.1), tag: 'battery' },
    { kind: 'camera', shape: 'box', halfExtents: v(0.03, 0.025, 0.04), translation: v(0, 0, -0.18), tag: 'camera' },
    arm('arm-fl', 0.12, -0.12, Math.PI / 4, v(0.02, 0.014, 0.16)),
    arm('arm-fr', -0.12, -0.12, -Math.PI / 4, v(0.02, 0.014, 0.16)),
    arm('arm-bl', 0.12, 0.12, -Math.PI / 4, v(0.02, 0.014, 0.16)),
    arm('arm-br', -0.12, 0.12, Math.PI / 4, v(0.02, 0.014, 0.16)),
    motor('motor-fl', 0.2, -0.2, 0.04),
    motor('motor-fr', -0.2, -0.2, 0.04),
    motor('motor-bl', 0.2, 0.2, 0.04),
    motor('motor-br', -0.2, 0.2, 0.04),
  ],
};

/** Nano Scout — compact body + small rings. */
export const COLLISION_NANO_SCOUT: CollisionProfile = {
  id: 'col-nano-scout',
  version: '1.0.0',
  queryRadius: 0.18,
  collisionScale: 1,
  damageMultiplier: 0.55,
  parts: [
    { kind: 'body', shape: 'box', halfExtents: v(0.045, 0.025, 0.055), translation: v(0, 0, 0), tag: 'body' },
    { kind: 'battery', shape: 'box', halfExtents: v(0.03, 0.015, 0.04), translation: v(0, -0.02, 0.01), tag: 'battery' },
    { kind: 'camera', shape: 'sphere', radius: 0.018, translation: v(0, 0, -0.055), tag: 'camera' },
    ring('ring-fl', 0.065, -0.065, 0.05, 0.008),
    ring('ring-fr', -0.065, -0.065, 0.05, 0.008),
    ring('ring-bl', 0.065, 0.065, 0.05, 0.008),
    ring('ring-br', -0.065, 0.065, 0.05, 0.008),
  ],
};

/** Apex R5 — narrow body + thin arms + motor tips (no prop blades). */
export const COLLISION_APEX_R5: CollisionProfile = {
  id: 'col-apex-r5',
  version: '1.0.0',
  queryRadius: 0.3,
  collisionScale: 1,
  damageMultiplier: 1.4,
  parts: [
    { kind: 'body', shape: 'box', halfExtents: v(0.05, 0.025, 0.08), translation: v(0, 0, 0), tag: 'body' },
    { kind: 'camera', shape: 'box', halfExtents: v(0.018, 0.016, 0.022), translation: v(0, -0.005, -0.09), tag: 'camera' },
    arm('arm-fl', 0.07, -0.07, Math.PI / 4, v(0.012, 0.009, 0.12)),
    arm('arm-fr', -0.07, -0.07, -Math.PI / 4, v(0.012, 0.009, 0.12)),
    arm('arm-bl', 0.07, 0.07, -Math.PI / 4, v(0.012, 0.009, 0.12)),
    arm('arm-br', -0.07, 0.07, Math.PI / 4, v(0.012, 0.009, 0.12)),
    motor('motor-fl', 0.14, -0.14, 0.028),
    motor('motor-fr', -0.14, -0.14, 0.028),
    motor('motor-bl', 0.14, 0.14, 0.028),
    motor('motor-br', -0.14, 0.14, 0.028),
  ],
};

/** Flux F5 — stronger body + thicker arms + camera cage + battery. */
export const COLLISION_FLUX_F5: CollisionProfile = {
  id: 'col-flux-f5',
  version: '1.0.0',
  queryRadius: 0.32,
  collisionScale: 1,
  damageMultiplier: 1.0,
  parts: [
    { kind: 'body', shape: 'box', halfExtents: v(0.09, 0.035, 0.11), translation: v(0, 0, 0), tag: 'body' },
    { kind: 'battery', shape: 'box', halfExtents: v(0.05, 0.02, 0.075), translation: v(0, -0.03, 0.02), tag: 'battery' },
    { kind: 'cameraCage', shape: 'box', halfExtents: v(0.03, 0.028, 0.035), translation: v(0, -0.008, -0.1), tag: 'camera-cage' },
    arm('arm-fl', 0.09, -0.09, Math.PI / 4, v(0.018, 0.012, 0.14)),
    arm('arm-fr', -0.09, -0.09, -Math.PI / 4, v(0.018, 0.012, 0.14)),
    arm('arm-bl', 0.09, 0.09, -Math.PI / 4, v(0.018, 0.012, 0.14)),
    arm('arm-br', -0.09, 0.09, Math.PI / 4, v(0.018, 0.012, 0.14)),
    motor('motor-fl', 0.155, -0.155, 0.035),
    motor('motor-fr', -0.155, -0.155, 0.035),
    motor('motor-bl', 0.155, 0.155, 0.035),
    motor('motor-br', -0.155, 0.155, 0.035),
  ],
};

/** Horizon L7 — extended body + long arms + large motors + battery. */
export const COLLISION_HORIZON_L7: CollisionProfile = {
  id: 'col-horizon-l7',
  version: '1.0.0',
  queryRadius: 0.48,
  collisionScale: 1,
  damageMultiplier: 1.35,
  parts: [
    { kind: 'body', shape: 'box', halfExtents: v(0.08, 0.04, 0.14), translation: v(0, 0, 0), tag: 'body' },
    { kind: 'battery', shape: 'box', halfExtents: v(0.055, 0.03, 0.1), translation: v(0, -0.025, 0.12), tag: 'battery' },
    { kind: 'camera', shape: 'box', halfExtents: v(0.025, 0.022, 0.03), translation: v(0, 0, -0.15), tag: 'camera' },
    { kind: 'antenna', shape: 'cylinder', radius: 0.008, halfHeight: 0.06, translation: v(0.04, 0.08, 0.08), tag: 'antenna' },
    arm('arm-fl', 0.14, -0.14, Math.PI / 4, v(0.022, 0.014, 0.2)),
    arm('arm-fr', -0.14, -0.14, -Math.PI / 4, v(0.022, 0.014, 0.2)),
    arm('arm-bl', 0.14, 0.14, -Math.PI / 4, v(0.022, 0.014, 0.2)),
    arm('arm-br', -0.14, 0.14, Math.PI / 4, v(0.022, 0.014, 0.2)),
    motor('motor-fl', 0.26, -0.26, 0.048),
    motor('motor-fr', -0.26, -0.26, 0.048),
    motor('motor-bl', 0.26, 0.26, 0.048),
    motor('motor-br', -0.26, 0.26, 0.048),
  ],
};

/** Safe default used when a profile fails validation. */
export const COLLISION_SAFE_DEFAULT = COLLISION_FLUX_F5;
