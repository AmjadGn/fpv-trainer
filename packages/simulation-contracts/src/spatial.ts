/**
 * Immutable spatial-bound and screen-space data contracts.
 * All lengths are meters per SIMULATOR_COORDINATE_SYSTEM_V1.
 */

import type { Quat, Vec2, Vec3 } from './math';
import { isFiniteNumber, isFiniteVec3 } from './math';

/** A sphere bound: center + radius in meters. */
export interface Sphere {
  readonly center: Vec3;
  readonly radiusMeters: number;
}

/** Axis-aligned bounding box, min/max corners in world axes. */
export interface Aabb {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Oriented bounding box: center + half-extents + orientation (body-to-world). */
export interface Obb {
  readonly center: Vec3;
  readonly halfExtents: Vec3;
  readonly orientation: Quat;
}

/** An inclusive altitude band, in meters, `minMeters <= maxMeters`. */
export interface AltitudeRange {
  readonly minMeters: number;
  readonly maxMeters: number;
}

/**
 * A point in normalized screen space. `u` and `v` are typically within
 * [0, 1] (0,0 = top-left, 1,1 = bottom-right) but this type does not clamp
 * — callers may represent slightly out-of-frame points, e.g. for
 * off-screen indicators.
 */
export interface NormalizedScreenPoint {
  readonly u: number;
  readonly v: number;
}

/** An axis-aligned rectangle in normalized screen space. */
export interface NormalizedScreenRectangle {
  readonly minU: number;
  readonly minV: number;
  readonly maxU: number;
  readonly maxV: number;
}

/**
 * A simple vertical prism defined by a 2D (top-down) polygon footprint
 * extruded between `minY` and `maxY`. Useful for coarse world-volume
 * checks (e.g. arena bounds) without pulling in a full geometry library.
 */
export interface PolygonPrism {
  readonly vertices: readonly Vec2[];
  readonly minY: number;
  readonly maxY: number;
}

/** Result of a validating spatial-bound constructor. */
export type SpatialConstructionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

function ok<T>(value: T): SpatialConstructionResult<T> {
  return { ok: true, value };
}

function fail<T>(reason: string): SpatialConstructionResult<T> {
  return { ok: false, reason };
}

export function createSphere(
  center: Vec3,
  radiusMeters: number,
): SpatialConstructionResult<Sphere> {
  if (!isFiniteVec3(center)) {
    return fail('Sphere center must be finite');
  }
  if (!isFiniteNumber(radiusMeters) || radiusMeters < 0) {
    return fail('Sphere radiusMeters must be a finite non-negative number');
  }
  return ok({ center, radiusMeters });
}

export function createAabb(min: Vec3, max: Vec3): SpatialConstructionResult<Aabb> {
  if (!isFiniteVec3(min) || !isFiniteVec3(max)) {
    return fail('Aabb min/max must be finite');
  }
  if (min.x > max.x || min.y > max.y || min.z > max.z) {
    return fail('Aabb min must be componentwise <= max');
  }
  return ok({ min, max });
}

export function createObb(
  center: Vec3,
  halfExtents: Vec3,
  orientation: Quat,
): SpatialConstructionResult<Obb> {
  if (!isFiniteVec3(center)) {
    return fail('Obb center must be finite');
  }
  if (
    !isFiniteVec3(halfExtents) ||
    halfExtents.x < 0 ||
    halfExtents.y < 0 ||
    halfExtents.z < 0
  ) {
    return fail('Obb halfExtents must be finite and non-negative');
  }
  if (
    !isFiniteNumber(orientation.x) ||
    !isFiniteNumber(orientation.y) ||
    !isFiniteNumber(orientation.z) ||
    !isFiniteNumber(orientation.w)
  ) {
    return fail('Obb orientation must be finite');
  }
  return ok({ center, halfExtents, orientation });
}

/**
 * Constructs an `AltitudeRange`, validating that both bounds are finite and
 * `minMeters <= maxMeters`.
 */
export function createAltitudeRange(
  minMeters: number,
  maxMeters: number,
): SpatialConstructionResult<AltitudeRange> {
  if (!isFiniteNumber(minMeters) || !isFiniteNumber(maxMeters)) {
    return fail('AltitudeRange bounds must be finite numbers');
  }
  if (minMeters > maxMeters) {
    return fail('AltitudeRange minMeters must be <= maxMeters');
  }
  return ok({ minMeters, maxMeters });
}

export function createNormalizedScreenPoint(
  u: number,
  v: number,
): SpatialConstructionResult<NormalizedScreenPoint> {
  if (!isFiniteNumber(u) || !isFiniteNumber(v)) {
    return fail('NormalizedScreenPoint u/v must be finite numbers');
  }
  return ok({ u, v });
}

/**
 * Constructs a `NormalizedScreenRectangle`, validating finiteness and that
 * `minU <= maxU` and `minV <= maxV`.
 */
export function createNormalizedScreenRectangle(
  minU: number,
  minV: number,
  maxU: number,
  maxV: number,
): SpatialConstructionResult<NormalizedScreenRectangle> {
  if (
    !isFiniteNumber(minU) ||
    !isFiniteNumber(minV) ||
    !isFiniteNumber(maxU) ||
    !isFiniteNumber(maxV)
  ) {
    return fail('NormalizedScreenRectangle bounds must be finite numbers');
  }
  if (minU > maxU || minV > maxV) {
    return fail('NormalizedScreenRectangle min bounds must be <= max bounds');
  }
  return ok({ minU, minV, maxU, maxV });
}

export function createPolygonPrism(
  vertices: readonly Vec2[],
  minY: number,
  maxY: number,
): SpatialConstructionResult<PolygonPrism> {
  if (vertices.length < 3) {
    return fail('PolygonPrism requires at least 3 vertices');
  }
  if (vertices.some((v) => !isFiniteNumber(v.x) || !isFiniteNumber(v.y))) {
    return fail('PolygonPrism vertices must be finite');
  }
  if (!isFiniteNumber(minY) || !isFiniteNumber(maxY) || minY > maxY) {
    return fail('PolygonPrism requires finite minY <= maxY');
  }
  return ok({ vertices, minY, maxY });
}
