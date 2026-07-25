import type RAPIER from '@dimforge/rapier3d-compat';

import type { CollisionProfile } from '../models/collision-profile.model';
import { COLLISION_SAFE_DEFAULT } from '../data/collision-profiles';

export interface BuiltAircraftColliders {
  colliders: RAPIER.Collider[];
  queryRadius: number;
  profileId: string;
  version: string;
}

/**
 * Builds Rapier compound colliders from a CollisionProfile.
 * Used by DroneCollisionService — does not create a second physics world.
 */
export function buildAircraftColliders(
  R: typeof RAPIER,
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  profile: CollisionProfile | null | undefined,
  setGroups: (desc: RAPIER.ColliderDesc) => RAPIER.ColliderDesc,
  onCreated: (collider: RAPIER.Collider, tag: string) => void,
): BuiltAircraftColliders {
  const p = profile && profile.parts.length ? profile : COLLISION_SAFE_DEFAULT;
  const colliders: RAPIER.Collider[] = [];
  const scale = Number.isFinite(p.collisionScale) && p.collisionScale > 0
    ? p.collisionScale
    : 1;

  for (const part of p.parts) {
    let desc: RAPIER.ColliderDesc | null = null;
    try {
      if (part.shape === 'box' && part.halfExtents) {
        desc = R.ColliderDesc.cuboid(
          Math.max(0.01, part.halfExtents.x * scale),
          Math.max(0.01, part.halfExtents.y * scale),
          Math.max(0.01, part.halfExtents.z * scale),
        );
      } else if (part.shape === 'sphere' && part.radius != null) {
        desc = R.ColliderDesc.ball(Math.max(0.01, part.radius * scale));
      } else if (part.shape === 'cylinder' && part.radius != null) {
        desc = R.ColliderDesc.cylinder(
          Math.max(0.01, (part.halfHeight ?? 0.02) * scale),
          Math.max(0.01, part.radius * scale),
        );
      }

      if (!desc) {
        continue;
      }

      desc.setTranslation(
        part.translation.x * scale,
        part.translation.y * scale,
        part.translation.z * scale,
      );

      if (part.yaw != null) {
        desc.setRotation({
          x: 0,
          y: Math.sin(part.yaw / 2),
          z: 0,
          w: Math.cos(part.yaw / 2),
        });
      }

      setGroups(desc);
      const col = world.createCollider(desc, body);
      colliders.push(col);
      onCreated(col, part.tag);
    } catch {
      // skip invalid part
    }
  }

  if (!colliders.length) {
    // Absolute last resort — small body box
    const desc = setGroups(
      R.ColliderDesc.cuboid(0.09, 0.035, 0.11),
    );
    const col = world.createCollider(desc, body);
    colliders.push(col);
    onCreated(col, 'body-fallback');
  }

  return {
    colliders,
    queryRadius: p.queryRadius * scale,
    profileId: p.id,
    version: p.version,
  };
}
