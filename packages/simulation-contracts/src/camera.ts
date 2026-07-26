/**
 * Camera data contracts: pure projection/pose description, no renderer
 * coupling. Deliberately excludes anything Three.js-specific (no
 * `THREE.PerspectiveCamera`, no device-pixel-ratio) and excludes runtime
 * effects like camera shake — those are renderer/runtime concerns layered
 * on top of this contract, not part of it.
 */

import type { Pose } from './math';
import { isFiniteNumber, isFinitePose } from './math';

export const PROJECTION_MODEL_VERSION = '1.0.0';

/** Standard mission-capture aspect ratio (16:9), used for recorded/replay framing. */
export const MISSION_CAPTURE_ASPECT_RATIO = 16 / 9;

/**
 * A perspective projection description.
 * `aspectRatio` is width / height.
 */
export interface CameraProjection {
  readonly verticalFovDegrees: number;
  readonly aspectRatio: number;
  readonly nearMeters: number;
  readonly farMeters: number;
  readonly projectionModelVersion: string;
}

/**
 * Static description of how a camera is rigged: an optional mount pose
 * relative to its parent (e.g. an FPV camera mounted on the aircraft body)
 * plus the projection it renders with. A rig with no `localMountPose` is
 * assumed to be free/world-mounted.
 */
export interface CameraRigDefinition {
  readonly localMountPose?: Pose;
  readonly projection: CameraProjection;
  /**
   * The aspect ratio mission-capture recordings should stabilize to,
   * independent of the live viewport aspect ratio. Defaults are provided
   * by `MISSION_CAPTURE_ASPECT_RATIO`; a rig may override it.
   */
  readonly stableMissionCaptureAspectRatio: number;
}

/** A single point-in-time camera state: resolved world pose + projection. */
export interface CameraSnapshot {
  readonly worldPose: Pose;
  readonly localMountPose?: Pose;
  readonly projection: CameraProjection;
}

export type CameraConstructionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

function ok<T>(value: T): CameraConstructionResult<T> {
  return { ok: true, value };
}

function fail<T>(reason: string): CameraConstructionResult<T> {
  return { ok: false, reason };
}

/**
 * Validates and constructs a `CameraProjection`.
 * Requires: finite positive FOV in (0, 180), finite positive aspect ratio,
 * finite positive near/far with `nearMeters < farMeters`.
 */
export function createCameraProjection(
  verticalFovDegrees: number,
  aspectRatio: number,
  nearMeters: number,
  farMeters: number,
  projectionModelVersion: string = PROJECTION_MODEL_VERSION,
): CameraConstructionResult<CameraProjection> {
  if (
    !isFiniteNumber(verticalFovDegrees) ||
    verticalFovDegrees <= 0 ||
    verticalFovDegrees >= 180
  ) {
    return fail('verticalFovDegrees must be a finite number in (0, 180)');
  }
  if (!isFiniteNumber(aspectRatio) || aspectRatio <= 0) {
    return fail('aspectRatio must be a finite positive number');
  }
  if (!isFiniteNumber(nearMeters) || nearMeters <= 0) {
    return fail('nearMeters must be a finite positive number');
  }
  if (!isFiniteNumber(farMeters) || farMeters <= nearMeters) {
    return fail('farMeters must be a finite number greater than nearMeters');
  }
  return ok({
    verticalFovDegrees,
    aspectRatio,
    nearMeters,
    farMeters,
    projectionModelVersion,
  });
}

export function isFiniteCameraProjection(projection: CameraProjection): boolean {
  return (
    isFiniteNumber(projection.verticalFovDegrees) &&
    isFiniteNumber(projection.aspectRatio) &&
    isFiniteNumber(projection.nearMeters) &&
    isFiniteNumber(projection.farMeters) &&
    projection.nearMeters > 0 &&
    projection.farMeters > projection.nearMeters
  );
}

export function isFiniteCameraSnapshot(snapshot: CameraSnapshot): boolean {
  if (!isFinitePose(snapshot.worldPose)) {
    return false;
  }
  if (snapshot.localMountPose !== undefined && !isFinitePose(snapshot.localMountPose)) {
    return false;
  }
  return isFiniteCameraProjection(snapshot.projection);
}
