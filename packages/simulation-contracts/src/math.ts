/**
 * Pure, engine-agnostic math data contracts shared across simulation
 * packages. Plain readonly records only — no class instances, no
 * mutation helpers that couple callers to a particular math library.
 *
 * Coordinate convention: see coordinate-system.ts. This module does not
 * encode any handedness/axis semantics itself — it is pure numeric shape.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Hamilton convention, (x, y, z, w) with w the scalar component. */
export interface Quat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** A rigid-body position + orientation pair, body-to-world. */
export interface Pose {
  readonly position: Vec3;
  readonly orientation: Quat;
}

/** Alias of Pose for call sites that talk about transforms rather than poses. */
export interface Transform {
  readonly position: Vec3;
  readonly orientation: Quat;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export const ZERO_VEC2: Vec2 = { x: 0, y: 0 };
export const ZERO_VEC3: Vec3 = { x: 0, y: 0, z: 0 };

/** Identity quaternion — no rotation. */
export function quatIdentity(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

export const IDENTITY_QUAT: Quat = { x: 0, y: 0, z: 0, w: 1 };

export function identityPose(): Pose {
  return { position: ZERO_VEC3, orientation: IDENTITY_QUAT };
}

export function identityTransform(): Transform {
  return { position: ZERO_VEC3, orientation: IDENTITY_QUAT };
}

/**
 * Ordinary finite-number check. Returns a boolean rather than throwing so
 * validation call sites can accumulate issues instead of unwinding the
 * stack on the first bad value.
 */
export function isFiniteNumber(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isFiniteVec2(value: Vec2): boolean {
  return isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

export function isFiniteVec3(value: Vec3): boolean {
  return (
    isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.z)
  );
}

export function isFiniteQuat(value: Quat): boolean {
  return (
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.z) &&
    isFiniteNumber(value.w)
  );
}

export function isFinitePose(value: Pose): boolean {
  return isFiniteVec3(value.position) && isFiniteQuat(value.orientation);
}

export function isFiniteTransform(value: Transform): boolean {
  return isFiniteVec3(value.position) && isFiniteQuat(value.orientation);
}

export const DEFAULT_UNIT_QUAT_EPSILON = 1e-4;

/** Squared magnitude of a quaternion, used to check the unit-length invariant. */
function quatMagnitudeSquared(value: Quat): number {
  return value.x * value.x + value.y * value.y + value.z * value.z + value.w * value.w;
}

/**
 * Whether a quaternion is finite and unit-length within `epsilon` of 1.
 * Does not throw — callers decide whether a near-unit quaternion should be
 * an error, a warning, or silently renormalized.
 */
export function isUnitQuat(value: Quat, epsilon = DEFAULT_UNIT_QUAT_EPSILON): boolean {
  if (!isFiniteQuat(value)) {
    return false;
  }
  return Math.abs(quatMagnitudeSquared(value) - 1) <= epsilon;
}
