/**
 * Authored spatial definitions for a location: boundaries, zones, altitude
 * bands, and spawn/restart points.
 *
 * Shapes are built on the primitive `Sphere` / `Aabb` / `Obb` / `PolygonPrism`
 * contracts from `@fpv/simulation-contracts` — this module only adds the
 * discriminated wrapper + domain semantics (which shape kind, which zone
 * kind) on top of them.
 */

import type { Aabb, AltitudeRange, Obb, PolygonPrism, Pose, Sphere } from '@fpv/simulation-contracts';
import type { RestartPointId, SpawnPointId, ZoneId } from './ids';

export interface SphereBoundsShape {
  readonly kind: 'sphere';
  readonly sphere: Sphere;
}

export interface AabbBoundsShape {
  readonly kind: 'aabb';
  readonly aabb: Aabb;
}

export interface ObbBoundsShape {
  readonly kind: 'obb';
  readonly obb: Obb;
}

export interface PolygonPrismBoundsShape {
  readonly kind: 'polygon-prism';
  readonly polygonPrism: PolygonPrism;
}

/** Any authored bound shape — used for arena boundaries and zone footprints. */
export type BoundaryShape =
  | SphereBoundsShape
  | AabbBoundsShape
  | ObbBoundsShape
  | PolygonPrismBoundsShape;

/**
 * Volumetric-only bound shape (no polygon-prism). Used where a shape must be
 * a closed volume around a point subject, e.g. photography subject bounds.
 */
export type VolumetricBoundsShape = SphereBoundsShape | AabbBoundsShape | ObbBoundsShape;

/** The nominal flyable region. Purely advisory unless paired with a hard boundary. */
export interface PlayableBoundary {
  readonly shape: BoundaryShape;
}

/** A boundary that triggers a soft warning (e.g. UI edge indicator) before the hard boundary. */
export interface SoftWarningBoundary {
  readonly shape: BoundaryShape;
}

/**
 * The authoritative hard boundary. Whether this is enforced as a collision
 * volume or an out-of-bounds/reset trigger is a runtime/physics concern —
 * this package only describes its geometry.
 */
export interface HardBoundary {
  readonly shape: BoundaryShape;
}

export type ZoneKind = 'restricted' | 'objective' | 'mission';

interface ZoneCommon {
  readonly id: ZoneId;
  readonly displayName?: string;
  readonly shape: BoundaryShape;
  readonly tags?: readonly string[];
}

/** A zone the aircraft should avoid (e.g. no-fly volume, hazard). */
export interface RestrictedZone extends ZoneCommon {
  readonly kind: 'restricted';
}

/** A zone tied to a scoring/gameplay objective (e.g. "fly through this gate volume"). */
export interface ObjectiveZone extends ZoneCommon {
  readonly kind: 'objective';
}

/** A general-purpose mission-authored zone with no built-in scoring semantics. */
export interface MissionZone extends ZoneCommon {
  readonly kind: 'mission';
}

export type Zone = RestrictedZone | ObjectiveZone | MissionZone;

/**
 * An authored vertical altitude layer (e.g. "low-altitude corridor",
 * "no-fly ceiling"). Purely descriptive metadata — enforcement policy lives
 * outside this package.
 */
export interface AltitudeBand {
  readonly label: string;
  readonly range: AltitudeRange;
  readonly tags?: readonly string[];
}

/**
 * A candidate spawn pose for starting a flight at this location.
 * Whether a given spawn point actually lies inside the hard boundary is a
 * cross-field invariant validated by `location-validation`, not here.
 */
export interface SpawnPoint {
  readonly id: SpawnPointId;
  readonly displayName?: string;
  readonly pose: Pose;
}

/**
 * A candidate restart pose used after a crash/reset. Same "validated
 * elsewhere" note as `SpawnPoint` applies to boundary containment.
 */
export interface RestartPoint {
  readonly id: RestartPointId;
  readonly displayName?: string;
  readonly pose: Pose;
}
