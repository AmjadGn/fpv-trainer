/**
 * Deterministic subject-bounds → screen-rectangle projection.
 *
 * Authority split (Checkpoint 5 review correction):
 * - `subjectBounds` → projected size, coverage, frame intersection
 * - `visibilitySamplePoints` → LOS / obstruction only (never framing)
 * - `scoringAnchor` → projected anchor, centering, distance, viewing angle
 *
 * Near-plane / invalid-geometry policy:
 * 1. Non-finite bounds geometry or camera orientation → `{ ok: false }`.
 * 2. Camera position inside / intersecting the authored bounds → `{ ok: false }`
 *    (do not invent huge rectangles when the subject surrounds the camera).
 * 3. All projection points behind the camera, or none within the clip range →
 *    successful projection with `screenRectangle: null` (same as a fully
 *    off-screen subject). No synthetic full-frame rectangle.
 * 4. Partial near-plane crossing → only `withinClipRange` points contribute to
 *    the screen rectangle; if none remain, `screenRectangle` is null.
 * 5. Any projected screen coordinate that is non-finite → `{ ok: false }`.
 *
 * Pure TypeScript. Imports only `@fpv/simulation-contracts` and local
 * projection helpers — no Angular, Three.js, Rapier, or location-domain.
 */

import {
  isFiniteNumber,
  isFiniteQuat,
  isFiniteVec3,
  type Aabb,
  type CameraSnapshot,
  type NormalizedScreenRectangle,
  type Obb,
  type PolygonPrism,
  type Sphere,
  type Vec3,
} from '@fpv/simulation-contracts';
import {
  computeNormalizedScreenRectangle,
  projectWorldPoint,
  projectSubjectSamplePoints,
  rotateVectorByQuat,
  type ProjectedPoint,
  type ProjectionResult,
} from './projection';

/** Structural bounds shape — compatible with `@fpv/location-domain` shapes. */
export type SubjectBoundsShape =
  | { readonly kind: 'sphere'; readonly sphere: Sphere }
  | { readonly kind: 'aabb'; readonly aabb: Aabb }
  | { readonly kind: 'obb'; readonly obb: Obb }
  | { readonly kind: 'polygon-prism'; readonly polygonPrism: PolygonPrism };

export interface SubjectBoundsProjection {
  readonly worldPoints: readonly Vec3[];
  readonly projectedPoints: readonly ProjectedPoint[];
  /** Null when no bounds points fall within the camera clip range. */
  readonly screenRectangle: NormalizedScreenRectangle | null;
  /** True when at least one bounds point is geometrically in front of the camera. */
  readonly anyInFrontOfCamera: boolean;
  /** True when the scoring/framing geometry surrounds or contains the camera. */
  readonly cameraInsideBounds: boolean;
}

function ok<T>(value: T): ProjectionResult<T> {
  return { ok: true, value };
}

function fail<T>(reason: string): ProjectionResult<T> {
  return { ok: false, reason };
}

function aabbCorners(min: Vec3, max: Vec3): readonly Vec3[] {
  return [
    { x: min.x, y: min.y, z: min.z },
    { x: max.x, y: min.y, z: min.z },
    { x: min.x, y: max.y, z: min.z },
    { x: max.x, y: max.y, z: min.z },
    { x: min.x, y: min.y, z: max.z },
    { x: max.x, y: min.y, z: max.z },
    { x: min.x, y: max.y, z: max.z },
    { x: max.x, y: max.y, z: max.z },
  ];
}

/**
 * Deterministic world-space points that define a conservative projected
 * silhouette for the authored bounds shape.
 */
export function getSubjectBoundsProjectionPoints(
  bounds: SubjectBoundsShape,
): ProjectionResult<readonly Vec3[]> {
  switch (bounds.kind) {
    case 'aabb': {
      const { min, max } = bounds.aabb;
      if (!isFiniteVec3(min) || !isFiniteVec3(max)) {
        return fail('getSubjectBoundsProjectionPoints: AABB min/max must be finite');
      }
      if (min.x > max.x || min.y > max.y || min.z > max.z) {
        return fail('getSubjectBoundsProjectionPoints: AABB min must be componentwise <= max');
      }
      return ok(aabbCorners(min, max));
    }
    case 'obb': {
      const { center, halfExtents, orientation } = bounds.obb;
      if (!isFiniteVec3(center) || !isFiniteVec3(halfExtents) || !isFiniteQuat(orientation)) {
        return fail('getSubjectBoundsProjectionPoints: OBB fields must be finite');
      }
      if (halfExtents.x < 0 || halfExtents.y < 0 || halfExtents.z < 0) {
        return fail('getSubjectBoundsProjectionPoints: OBB halfExtents must be non-negative');
      }
      const localCorners: readonly Vec3[] = [
        { x: -halfExtents.x, y: -halfExtents.y, z: -halfExtents.z },
        { x: halfExtents.x, y: -halfExtents.y, z: -halfExtents.z },
        { x: -halfExtents.x, y: halfExtents.y, z: -halfExtents.z },
        { x: halfExtents.x, y: halfExtents.y, z: -halfExtents.z },
        { x: -halfExtents.x, y: -halfExtents.y, z: halfExtents.z },
        { x: halfExtents.x, y: -halfExtents.y, z: halfExtents.z },
        { x: -halfExtents.x, y: halfExtents.y, z: halfExtents.z },
        { x: halfExtents.x, y: halfExtents.y, z: halfExtents.z },
      ];
      const world: Vec3[] = [];
      for (const local of localCorners) {
        const rotated = rotateVectorByQuat(local, orientation);
        if (!rotated.ok) {
          return fail(`getSubjectBoundsProjectionPoints: ${rotated.reason}`);
        }
        world.push({
          x: center.x + rotated.value.x,
          y: center.y + rotated.value.y,
          z: center.z + rotated.value.z,
        });
      }
      return ok(world);
    }
    case 'sphere': {
      const { center, radiusMeters } = bounds.sphere;
      if (!isFiniteVec3(center) || !isFiniteNumber(radiusMeters) || radiusMeters < 0) {
        return fail('getSubjectBoundsProjectionPoints: sphere center/radius must be finite and non-negative');
      }
      // Conservative, deterministic extremal set: eight corners of the axis-
      // aligned cube that encloses the sphere. No random surface sampling.
      return ok(
        aabbCorners(
          {
            x: center.x - radiusMeters,
            y: center.y - radiusMeters,
            z: center.z - radiusMeters,
          },
          {
            x: center.x + radiusMeters,
            y: center.y + radiusMeters,
            z: center.z + radiusMeters,
          },
        ),
      );
    }
    case 'polygon-prism': {
      const prism = bounds.polygonPrism;
      if (!isFiniteNumber(prism.minY) || !isFiniteNumber(prism.maxY) || prism.minY > prism.maxY) {
        return fail('getSubjectBoundsProjectionPoints: polygon-prism requires finite minY <= maxY');
      }
      if (prism.vertices.length < 3) {
        return fail('getSubjectBoundsProjectionPoints: polygon-prism requires at least 3 vertices');
      }
      const points: Vec3[] = [];
      for (let i = 0; i < prism.vertices.length; i += 1) {
        const vertex = prism.vertices[i]!;
        if (!isFiniteNumber(vertex.x) || !isFiniteNumber(vertex.y)) {
          return fail(`getSubjectBoundsProjectionPoints: polygon-prism vertex[${i}] must be finite`);
        }
        // Vec2.{x,y} stores top-down (world X, world Z) per PolygonPrism docs.
        points.push({ x: vertex.x, y: prism.minY, z: vertex.y });
        points.push({ x: vertex.x, y: prism.maxY, z: vertex.y });
      }
      return ok(points);
    }
    default: {
      const exhaustive: never = bounds;
      return fail(
        `getSubjectBoundsProjectionPoints: unsupported bounds shape kind "${String(
          (exhaustive as { kind?: unknown }).kind,
        )}"`,
      );
    }
  }
}

function pointInSphere(point: Vec3, sphere: Sphere): boolean {
  const dx = point.x - sphere.center.x;
  const dy = point.y - sphere.center.y;
  const dz = point.z - sphere.center.z;
  return dx * dx + dy * dy + dz * dz <= sphere.radiusMeters * sphere.radiusMeters;
}

function pointInAabb(point: Vec3, aabb: Aabb): boolean {
  return (
    point.x >= aabb.min.x &&
    point.x <= aabb.max.x &&
    point.y >= aabb.min.y &&
    point.y <= aabb.max.y &&
    point.z >= aabb.min.z &&
    point.z <= aabb.max.z
  );
}

function pointInObb(point: Vec3, obb: Obb): boolean {
  const relative: Vec3 = {
    x: point.x - obb.center.x,
    y: point.y - obb.center.y,
    z: point.z - obb.center.z,
  };
  const inverse = rotateVectorByQuat(relative, {
    x: -obb.orientation.x,
    y: -obb.orientation.y,
    z: -obb.orientation.z,
    w: obb.orientation.w,
  });
  if (!inverse.ok) {
    return false;
  }
  const local = inverse.value;
  return (
    Math.abs(local.x) <= obb.halfExtents.x &&
    Math.abs(local.y) <= obb.halfExtents.y &&
    Math.abs(local.z) <= obb.halfExtents.z
  );
}

function pointInPolygonPrism(point: Vec3, prism: PolygonPrism): boolean {
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

/** Whether the camera position lies inside the authored subject bounds. */
export function isCameraInsideSubjectBounds(
  cameraPosition: Vec3,
  bounds: SubjectBoundsShape,
): boolean {
  if (!isFiniteVec3(cameraPosition)) {
    return false;
  }
  switch (bounds.kind) {
    case 'sphere':
      return pointInSphere(cameraPosition, bounds.sphere);
    case 'aabb':
      return pointInAabb(cameraPosition, bounds.aabb);
    case 'obb':
      return pointInObb(cameraPosition, bounds.obb);
    case 'polygon-prism':
      return pointInPolygonPrism(cameraPosition, bounds.polygonPrism);
    default:
      return false;
  }
}

/**
 * Projects authored subject bounds through a camera snapshot into a
 * normalized screen rectangle for framing / coverage scoring.
 */
export function projectSubjectBounds(
  bounds: SubjectBoundsShape,
  cameraSnapshot: CameraSnapshot,
): ProjectionResult<SubjectBoundsProjection> {
  const cameraInsideBounds = isCameraInsideSubjectBounds(
    cameraSnapshot.worldPose.position,
    bounds,
  );
  if (cameraInsideBounds) {
    return fail(
      'projectSubjectBounds: camera is inside subject bounds; refusing unbounded screen rectangle',
    );
  }

  const worldPointsResult = getSubjectBoundsProjectionPoints(bounds);
  if (!worldPointsResult.ok) {
    return worldPointsResult;
  }
  const worldPoints = worldPointsResult.value;

  const projected = projectSubjectSamplePoints(worldPoints, cameraSnapshot);
  if (!projected.ok) {
    return projected;
  }

  for (const point of projected.value) {
    if (point.screen !== null) {
      if (!isFiniteNumber(point.screen.u) || !isFiniteNumber(point.screen.v)) {
        return fail('projectSubjectBounds: projected screen coordinates must be finite');
      }
    }
  }

  const anyInFrontOfCamera = projected.value.some((point) => point.inFrontOfCamera);
  const rectangle = computeNormalizedScreenRectangle(projected.value);
  // No clip-range points → null rectangle (policy §3/§4), not a construction failure.
  const screenRectangle = rectangle.ok ? rectangle.value : null;

  return ok({
    worldPoints,
    projectedPoints: projected.value,
    screenRectangle,
    anyInFrontOfCamera,
    cameraInsideBounds: false,
  });
}
