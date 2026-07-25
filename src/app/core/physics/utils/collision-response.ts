import type { Quat, Vec3 } from '../../flight/models/flight-state.model';
import type {
  CollisionContactEvent,
  CollisionCorrection,
  CollisionImpactThresholds,
  CollisionMaterialId,
  CollisionOutcome,
  CrashReason,
} from '../models/collision.models';
import { DEFAULT_IMPACT_THRESHOLDS } from '../models/collision.models';
import { getCollisionMaterial } from '../models/physics-body.models';

export interface RawCollisionHit {
  objectId: string;
  material: CollisionMaterialId;
  point: Vec3;
  normal: Vec3;
  /** Separation depth (positive = penetrating). */
  penetration: number;
  /** Relative velocity of drone into the surface (world). */
  relativeVelocity: Vec3;
  isSensor?: boolean;
  isWater?: boolean;
  isGroundLike?: boolean;
  propStrike?: boolean;
  damageMultiplier?: number;
  timestampMs: number;
}

function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function tiltFromUpright(q: Quat): number {
  // Local up (0,1,0) rotated → world; angle from world up.
  const tx = 2 * (q.y * 0 - q.z * 1);
  const ty = 2 * (q.z * 0 - q.x * 0);
  const tz = 2 * (q.x * 1 - q.y * 0);
  const uy = 1 + q.w * ty + (q.z * tx - q.x * tz);
  return Math.acos(clamp(uy, -1, 1));
}

export function classifyImpact(
  impactSpeed: number,
  thresholds: CollisionImpactThresholds = DEFAULT_IMPACT_THRESHOLDS,
): CollisionOutcome {
  if (impactSpeed >= thresholds.catastrophicImpactThreshold) {
    return 'catastrophic';
  }
  if (impactSpeed >= thresholds.crashImpactThreshold) {
    return 'severe';
  }
  if (impactSpeed >= thresholds.moderateImpactThreshold) {
    return 'moderate';
  }
  if (impactSpeed >= thresholds.scrapeThreshold) {
    return 'scrape';
  }
  return 'none';
}

export function crashReasonForHit(hit: RawCollisionHit): CrashReason {
  if (hit.isWater) {
    return 'water';
  }
  if (hit.propStrike) {
    return 'propStrike';
  }
  if (hit.isGroundLike) {
    return 'terrain';
  }
  return 'structure';
}

/**
 * Resolve hybrid collision: custom flight predicted pose, Rapier contacts
 * feed corrected velocity / position / optional crash back into custom state.
 *
 * Deterministic — no Math.random.
 */
export function resolveCollisionResponse(options: {
  position: Vec3;
  velocity: Vec3;
  orientation: Quat;
  angularVelocity: { pitch: number; yaw: number; roll: number };
  hits: readonly RawCollisionHit[];
  armed: boolean;
  thresholds?: CollisionImpactThresholds;
  /** When true, competitive mode: no random damage side-effects. */
  competitive?: boolean;
}): CollisionCorrection {
  const thresholds = options.thresholds ?? DEFAULT_IMPACT_THRESHOLDS;
  const events: CollisionContactEvent[] = [];
  let pos = { ...options.position };
  let vel = { ...options.velocity };
  let ang = { ...options.angularVelocity };
  let crash = false;
  let crashReason: CrashReason | undefined;
  let worst: CollisionOutcome = 'none';
  let damageDelta = 0;

  if (options.hits.length === 0) {
    return {
      position: pos,
      velocity: vel,
      angularVelocity: ang,
      outcome: 'none',
      crash: false,
      events,
      damageDelta: 0,
    };
  }

  for (const hit of options.hits) {
    if (hit.isSensor && !hit.isWater && !hit.propStrike) {
      continue;
    }

    const mat = getCollisionMaterial(hit.material);
    const into = -dot(hit.relativeVelocity, hit.normal);
    const impactSpeed = Math.max(0, into);
    const tangential = Math.hypot(
      hit.relativeVelocity.x + hit.normal.x * into,
      hit.relativeVelocity.y + hit.normal.y * into,
      hit.relativeVelocity.z + hit.normal.z * into,
    );

    // Water: immediate crash.
    if (hit.isWater) {
      worst = 'waterCrash';
      crash = true;
      crashReason = 'water';
      damageDelta += 40;
      events.push({
        timestampMs: hit.timestampMs,
        objectId: hit.objectId,
        material: hit.material,
        impactStrength: impactSpeed,
        collisionPoint: { ...hit.point },
        collisionNormal: { ...hit.normal },
        relativeVelocity: { ...hit.relativeVelocity },
        outcome: 'waterCrash',
        crashState: true,
        crashReason: 'water',
      });
      vel = { x: vel.x * 0.15, y: Math.min(vel.y, -0.5), z: vel.z * 0.15 };
      continue;
    }

    // Penetration resolution along contact normal — only when actually inside.
    if (hit.penetration > 0.001) {
      const push = Math.min(hit.penetration + 0.001, 0.08);
      pos = {
        x: pos.x + hit.normal.x * push,
        y: pos.y + hit.normal.y * push,
        z: pos.z + hit.normal.z * push,
      };
    }

    // Ground-like soft landing — only when near the surface and moving into it.
    if (hit.isGroundLike && hit.normal.y > 0.65) {
      const nearSurface =
        hit.penetration > 0.001 || options.position.y <= 0.35;
      const descending = vel.y < 0.15;
      if (!nearSurface || !descending) {
        continue;
      }

      const verticalSpeed = -Math.min(0, vel.y);
      const tilt = tiltFromUpright(options.orientation);
      const horiz = Math.hypot(vel.x, vel.z);

      if (
        verticalSpeed <= thresholds.safeLandingVerticalSpeed &&
        tilt <= thresholds.safeLandingTiltRad &&
        horiz < 4
      ) {
        if (vel.y < 0) {
          vel = { x: vel.x * 0.92, y: 0, z: vel.z * 0.92 };
        }
        // Snap onto ground only when penetrating / very close.
        if (pos.y < 0.05) {
          pos = { ...pos, y: 0.05 };
        }
        events.push({
          timestampMs: hit.timestampMs,
          objectId: hit.objectId,
          material: hit.material,
          impactStrength: verticalSpeed,
          collisionPoint: { ...hit.point },
          collisionNormal: { ...hit.normal },
          relativeVelocity: { ...hit.relativeVelocity },
          outcome: 'safeLanding',
          crashState: false,
        });
        if (worst === 'none') {
          worst = 'safeLanding';
        }
        continue;
      }

      if (
        verticalSpeed > thresholds.hardLandingVerticalSpeed ||
        tilt > thresholds.safeLandingTiltRad * 1.35 ||
        horiz > 6
      ) {
        worst = 'hardLanding';
        crash = true;
        crashReason = 'hardLanding';
        damageDelta += 25 * mat.damageMultiplier;
        vel = { x: 0, y: 0, z: 0 };
        ang = { pitch: ang.pitch * 0.2, yaw: ang.yaw * 0.2, roll: ang.roll * 0.2 };
        events.push({
          timestampMs: hit.timestampMs,
          objectId: hit.objectId,
          material: hit.material,
          impactStrength: Math.max(verticalSpeed, horiz),
          collisionPoint: { ...hit.point },
          collisionNormal: { ...hit.normal },
          relativeVelocity: { ...hit.relativeVelocity },
          outcome: 'hardLanding',
          crashState: true,
          crashReason: 'hardLanding',
        });
        continue;
      }
    }

    let outcome = classifyImpact(impactSpeed, thresholds);
    if (hit.propStrike && impactSpeed >= thresholds.moderateImpactThreshold) {
      outcome = impactSpeed >= thresholds.crashImpactThreshold ? 'severe' : 'propStrike';
    }

    const mult = (hit.damageMultiplier ?? 1) * mat.damageMultiplier;

    if (outcome === 'scrape') {
      // Mild velocity bleed + tiny angular nudge.
      const keep = 0.92;
      const vn = Math.max(0, -dot(vel, hit.normal));
      vel = {
        x: vel.x + hit.normal.x * vn * 0.35,
        y: vel.y + hit.normal.y * vn * 0.35,
        z: vel.z + hit.normal.z * vn * 0.35,
      };
      vel = { x: vel.x * keep, y: vel.y * keep, z: vel.z * keep };
      ang = {
        pitch: ang.pitch + hit.normal.z * 0.4,
        yaw: ang.yaw + hit.normal.x * 0.25,
        roll: ang.roll - hit.normal.x * 0.35,
      };
      damageDelta += 0.8 * mult;
    } else if (outcome === 'moderate' || outcome === 'propStrike') {
      const vn = Math.max(0, -dot(vel, hit.normal));
      const bounce = 0.22 + mat.restitution * 0.4;
      vel = {
        x: vel.x + hit.normal.x * vn * (1 + bounce),
        y: vel.y + hit.normal.y * vn * (1 + bounce),
        z: vel.z + hit.normal.z * vn * (1 + bounce),
      };
      vel = { x: vel.x * 0.78, y: vel.y * 0.78, z: vel.z * 0.78 };
      ang = {
        pitch: ang.pitch + (tangential + vn) * 0.15 * Math.sign(hit.normal.z || 1),
        yaw: ang.yaw + hit.normal.x * vn * 0.12,
        roll: ang.roll + hit.normal.x * vn * 0.18,
      };
      damageDelta += 4 * mult;
      if (
        !options.competitive &&
        options.armed &&
        impactSpeed > thresholds.crashImpactThreshold * 0.85
      ) {
        crash = true;
        crashReason = crashReasonForHit(hit);
        outcome = 'severe';
      }
    } else if (outcome === 'severe' || outcome === 'catastrophic') {
      crash = true;
      crashReason = crashReasonForHit(hit);
      const vn = Math.max(0, -dot(vel, hit.normal));
      vel = {
        x: (vel.x + hit.normal.x * vn * 1.4) * 0.45,
        y: (vel.y + hit.normal.y * vn * 1.4) * 0.45,
        z: (vel.z + hit.normal.z * vn * 1.4) * 0.45,
      };
      ang = {
        pitch: ang.pitch * 0.4 + vn * 0.35,
        yaw: ang.yaw * 0.4 + hit.normal.x * vn * 0.2,
        roll: ang.roll * 0.4 - hit.normal.z * vn * 0.25,
      };
      damageDelta += (outcome === 'catastrophic' ? 35 : 18) * mult;
    }

    const rank: Record<CollisionOutcome, number> = {
      none: 0,
      scrape: 1,
      safeLanding: 1,
      propStrike: 2,
      moderate: 3,
      hardLanding: 4,
      severe: 5,
      waterCrash: 6,
      catastrophic: 7,
    };
    if (rank[outcome] > rank[worst]) {
      worst = outcome;
    }

    events.push({
      timestampMs: hit.timestampMs,
      objectId: hit.objectId,
      material: hit.material,
      impactStrength: impactSpeed,
      collisionPoint: { ...hit.point },
      collisionNormal: { ...hit.normal },
      relativeVelocity: { ...hit.relativeVelocity },
      outcome,
      crashState: crash,
      crashReason,
      propStrike: hit.propStrike,
    });
  }

  // Sanitize NaNs.
  if (![pos.x, pos.y, pos.z, vel.x, vel.y, vel.z].every(Number.isFinite)) {
    pos = { ...options.position };
    vel = { x: 0, y: 0, z: 0 };
    crash = true;
    crashReason = crashReason ?? 'unknown';
    worst = 'catastrophic';
  }

  return {
    position: pos,
    velocity: vel,
    angularVelocity: ang,
    outcome: worst,
    crash,
    crashReason,
    events,
    damageDelta,
  };
}

export function damageStateFromAccumulated(damage: number): string {
  if (damage >= 80) {
    return 'crashed';
  }
  if (damage >= 55) {
    return 'critical';
  }
  if (damage >= 28) {
    return 'damaged';
  }
  if (damage >= 8) {
    return 'scratched';
  }
  return 'pristine';
}

export function impactSpeedOf(rel: Vec3, normal: Vec3): number {
  return Math.max(0, -dot(rel, normal));
}

export function vectorLength(v: Vec3): number {
  return length(v);
}
