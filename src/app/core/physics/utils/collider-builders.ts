import type RAPIER from '@dimforge/rapier3d-compat';

import type { ColliderShapeDef } from '../models/collision.models';
import { getCollisionMaterial } from '../models/physics-body.models';
import type { CollisionMaterialId } from '../models/collision.models';

export interface BuiltColliderDesc {
  desc: RAPIER.ColliderDesc;
  shapeKind: ColliderShapeDef['kind'];
}

/**
 * Build a Rapier ColliderDesc from an authored shape definition.
 * Returns null for unsupported / invalid shapes (caller logs + skips).
 */
export function buildColliderDesc(
  R: typeof RAPIER,
  shape: ColliderShapeDef,
  materialId: CollisionMaterialId,
  sensor = false,
): BuiltColliderDesc | null {
  try {
    const mat = getCollisionMaterial(materialId);
    let desc: RAPIER.ColliderDesc | null = null;

    switch (shape.kind) {
      case 'box': {
        const he = shape.halfExtents;
        if (!he) {
          return null;
        }
        desc = R.ColliderDesc.cuboid(
          Math.max(0.01, he.x),
          Math.max(0.01, he.y),
          Math.max(0.01, he.z),
        );
        break;
      }
      case 'sphere': {
        const r = Math.max(0.01, shape.radius ?? 0.1);
        desc = R.ColliderDesc.ball(r);
        break;
      }
      case 'capsule': {
        const hh = Math.max(0.01, shape.halfHeight ?? 0.1);
        const r = Math.max(0.01, shape.radius ?? 0.05);
        desc = R.ColliderDesc.capsule(hh, r);
        break;
      }
      case 'cylinder': {
        const hh = Math.max(0.01, shape.halfHeight ?? 0.1);
        const r = Math.max(0.01, shape.radius ?? 0.05);
        desc = R.ColliderDesc.cylinder(hh, r);
        break;
      }
      case 'heightfield': {
        const hf = shape.heightfield;
        if (!hf || hf.nrows < 2 || hf.ncols < 2) {
          return null;
        }
        const heights =
          hf.heights instanceof Float32Array
            ? hf.heights
            : new Float32Array(hf.heights);
        desc = R.ColliderDesc.heightfield(
          hf.nrows,
          hf.ncols,
          heights,
          hf.scale,
        );
        break;
      }
      case 'trimesh': {
        if (!shape.vertices || !shape.indices) {
          return null;
        }
        const verts =
          shape.vertices instanceof Float32Array
            ? shape.vertices
            : new Float32Array(shape.vertices);
        const indices =
          shape.indices instanceof Uint32Array
            ? shape.indices
            : new Uint32Array(shape.indices);
        desc = R.ColliderDesc.trimesh(verts, indices);
        break;
      }
      case 'convexHull': {
        if (!shape.vertices) {
          return null;
        }
        const verts =
          shape.vertices instanceof Float32Array
            ? shape.vertices
            : new Float32Array(shape.vertices);
        desc = R.ColliderDesc.convexHull(verts);
        break;
      }
      default:
        return null;
    }

    if (!desc) {
      return null;
    }

    desc
      .setFriction(mat.friction)
      .setRestitution(mat.restitution)
      .setSensor(sensor);

    if (shape.translation) {
      desc.setTranslation(
        shape.translation.x,
        shape.translation.y,
        shape.translation.z,
      );
    }
    if (shape.rotation) {
      desc.setRotation({
        x: shape.rotation.x,
        y: shape.rotation.y,
        z: shape.rotation.z,
        w: shape.rotation.w,
      });
    }

    return { desc, shapeKind: shape.kind };
  } catch {
    return null;
  }
}

/** Approximate drone compound collider dimensions (meters). Matches visual model. */
export const DRONE_COLLIDER_DIMENSIONS = {
  bodyHalfExtents: { x: 0.09, y: 0.035, z: 0.11 },
  armHalfExtents: { x: 0.018, y: 0.012, z: 0.14 },
  motorRadius: 0.035,
  motorOffset: 0.155,
  propDiscRadius: 0.13,
  batteryHalfExtents: { x: 0.05, y: 0.02, z: 0.075 },
} as const;
