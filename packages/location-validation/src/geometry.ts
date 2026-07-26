/**
 * Minimal, dependency-light spatial finiteness/containment checks used by
 * `validateLocationDefinition` to check that authored spawn/restart points
 * lie within a location's hard boundary, and that authored shape geometry
 * is made of finite numbers.
 *
 * Deliberately self-contained (no dependency on `@fpv/photography-domain`'s
 * projection math): this is coarse authored-content validation, not
 * camera/runtime geometry, and must never throw or reject on merely
 * near-unit orientation quaternions the way that package's reject-invalid
 * projection helpers do.
 */

import {
  isFiniteNumber,
  isFiniteQuat,
  isFiniteVec3,
  type Aabb,
  type Obb,
  type PolygonPrism,
  type Quat,
  type Sphere,
  type Vec3,
} from '@fpv/simulation-contracts';
import type { BoundaryShape, VolumetricBoundsShape } from '@fpv/location-domain';

export function isFiniteSphere(sphere: Sphere): boolean {
  return isFiniteVec3(sphere.center) && isFiniteNumber(sphere.radiusMeters) && sphere.radiusMeters >= 0;
}

export function isFiniteAabb(aabb: Aabb): boolean {
  return isFiniteVec3(aabb.min) && isFiniteVec3(aabb.max);
}

export function isFiniteObb(obb: Obb): boolean {
  return (
    isFiniteVec3(obb.center) &&
    isFiniteVec3(obb.halfExtents) &&
    obb.halfExtents.x >= 0 &&
    obb.halfExtents.y >= 0 &&
    obb.halfExtents.z >= 0 &&
    isFiniteQuat(obb.orientation)
  );
}

export function isFinitePolygonPrism(prism: PolygonPrism): boolean {
  return (
    Array.isArray(prism.vertices) &&
    prism.vertices.length >= 3 &&
    prism.vertices.every((vertex) => isFiniteNumber(vertex.x) && isFiniteNumber(vertex.y)) &&
    isFiniteNumber(prism.minY) &&
    isFiniteNumber(prism.maxY)
  );
}

/** Whether a `VolumetricBoundsShape` or `BoundaryShape`'s underlying geometry is entirely finite. */
export function isFiniteBoundaryShape(shape: BoundaryShape | VolumetricBoundsShape): boolean {
  switch (shape.kind) {
    case 'sphere':
      return isFiniteSphere(shape.sphere);
    case 'aabb':
      return isFiniteAabb(shape.aabb);
    case 'obb':
      return isFiniteObb(shape.obb);
    case 'polygon-prism':
      return isFinitePolygonPrism(shape.polygonPrism);
    default:
      return false;
  }
}

function conjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

/** Rotates `v` by quaternion `q`, assuming both are already known-finite. No unit-length rejection. */
function rotateVectorByQuatUnchecked(v: Vec3, q: Quat): Vec3 {
  const qv: Vec3 = { x: q.x, y: q.y, z: q.z };
  const uvx = qv.y * v.z - qv.z * v.y;
  const uvy = qv.z * v.x - qv.x * v.z;
  const uvz = qv.x * v.y - qv.y * v.x;
  const uuvx = qv.y * uvz - qv.z * uvy;
  const uuvy = qv.z * uvx - qv.x * uvz;
  const uuvz = qv.x * uvy - qv.y * uvx;
  return {
    x: v.x + 2 * (q.w * uvx + uuvx),
    y: v.y + 2 * (q.w * uvy + uuvy),
    z: v.z + 2 * (q.w * uvz + uuvz),
  };
}

export function pointInSphere(point: Vec3, sphere: Sphere): boolean {
  const dx = point.x - sphere.center.x;
  const dy = point.y - sphere.center.y;
  const dz = point.z - sphere.center.z;
  return dx * dx + dy * dy + dz * dz <= sphere.radiusMeters * sphere.radiusMeters;
}

export function pointInAabb(point: Vec3, aabb: Aabb): boolean {
  return (
    point.x >= aabb.min.x &&
    point.x <= aabb.max.x &&
    point.y >= aabb.min.y &&
    point.y <= aabb.max.y &&
    point.z >= aabb.min.z &&
    point.z <= aabb.max.z
  );
}

/** Transforms `point` into the OBB's local frame (translate + inverse-rotate) and checks half-extent membership. */
export function pointInObb(point: Vec3, obb: Obb): boolean {
  const relative: Vec3 = {
    x: point.x - obb.center.x,
    y: point.y - obb.center.y,
    z: point.z - obb.center.z,
  };
  const local = rotateVectorByQuatUnchecked(relative, conjugate(obb.orientation));
  return (
    Math.abs(local.x) <= obb.halfExtents.x &&
    Math.abs(local.y) <= obb.halfExtents.y &&
    Math.abs(local.z) <= obb.halfExtents.z
  );
}

/**
 * Point-in-polygon-prism test: `point.y` must fall within `[minY, maxY]`,
 * and `(point.x, point.z)` must fall within the top-down polygon footprint
 * (`vertices` are `(x, z)` pairs stored as `Vec2.{x, y}` per
 * `PolygonPrism`'s doc comment), tested via standard ray casting.
 */
export function pointInPolygonPrism(point: Vec3, prism: PolygonPrism): boolean {
  if (point.y < prism.minY || point.y > prism.maxY) {
    return false;
  }
  const vertices = prism.vertices;
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const vi = vertices[i];
    const vj = vertices[j];
    if (vi === undefined || vj === undefined) {
      continue;
    }
    const intersects =
      vi.y > point.z !== vj.y > point.z &&
      point.x < ((vj.x - vi.x) * (point.z - vi.y)) / (vj.y - vi.y) + vi.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Point-in-boundary-shape containment check across every authored shape
 * kind (`sphere`, `aabb`, `obb`, `polygon-prism`). Returns `false` for an
 * unrecognized shape kind rather than throwing.
 */
export function pointInBoundaryShape(point: Vec3, shape: BoundaryShape): boolean {
  switch (shape.kind) {
    case 'sphere':
      return pointInSphere(point, shape.sphere);
    case 'aabb':
      return pointInAabb(point, shape.aabb);
    case 'obb':
      return pointInObb(point, shape.obb);
    case 'polygon-prism':
      return pointInPolygonPrism(point, shape.polygonPrism);
    default:
      return false;
  }
}
