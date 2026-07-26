/**
 * Authoritative simulator coordinate-system convention.
 *
 * +X = right, +Y = up, -Z = aircraft forward (right-handed).
 * Quaternion orientation maps body-space to world-space (body -> world).
 *
 * This is a pure geometric/spatial contract. It intentionally says nothing
 * about controller/input axis polarity, stick inversion, or calibration —
 * those concerns live in input-handling packages, not here. Do not add
 * controller-axis fields to this module.
 */

import type { Vec3 } from './math';

export const COORDINATE_SYSTEM_VERSION = '1.0.0';

export type Handedness = 'right' | 'left';

/** Which world axis a named direction points along, expressed as a unit vector. */
export interface CoordinateSystemConvention {
  readonly version: string;
  readonly handedness: Handedness;
  /** World-space unit vector for "screen/world right". */
  readonly worldRight: Vec3;
  /** World-space unit vector for "world up". */
  readonly worldUp: Vec3;
  /** World-space unit vector for "world backward" (i.e. -forward). */
  readonly worldBackward: Vec3;
  /** Aircraft body-space forward direction, expressed in world axes when unrotated. */
  readonly aircraftForward: Vec3;
  /** Aircraft body-space up direction, expressed in world axes when unrotated. */
  readonly aircraftUp: Vec3;
  /** Aircraft body-space right direction, expressed in world axes when unrotated. */
  readonly aircraftRight: Vec3;
  /** Unit of distance used by every length/position value in this convention. */
  readonly distanceUnit: 'meters';
  /** What an orientation quaternion under this convention maps between. */
  readonly orientationConvention: 'body-to-world';
}

/**
 * The single authoritative coordinate-system descriptor for the simulator.
 * +X right, +Y up, -Z forward, right-handed, meters, body-to-world quaternions.
 */
export const SIMULATOR_COORDINATE_SYSTEM_V1: CoordinateSystemConvention = {
  version: COORDINATE_SYSTEM_VERSION,
  handedness: 'right',
  worldRight: { x: 1, y: 0, z: 0 },
  worldUp: { x: 0, y: 1, z: 0 },
  worldBackward: { x: 0, y: 0, z: 1 },
  aircraftForward: { x: 0, y: 0, z: -1 },
  aircraftUp: { x: 0, y: 1, z: 0 },
  aircraftRight: { x: 1, y: 0, z: 0 },
  distanceUnit: 'meters',
  orientationConvention: 'body-to-world',
};
