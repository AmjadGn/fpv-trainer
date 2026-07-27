/**
 * `@fpv/location-validation` — deep, cross-field structural validation of
 * location definitions, mission definitions, and photography objectives,
 * WITHOUT loading any runtime assets (textures, meshes, audio, terrain
 * collision data).
 *
 * Depends on `@fpv/simulation-contracts`, `@fpv/location-domain`,
 * `@fpv/mission-domain`, and `@fpv/photography-domain`. No Angular, no
 * Three.js, no Rapier, no IndexedDB, no `src/app`.
 *
 * Validation policy: every exported validator returns a `ValidationReport`
 * (from `@fpv/simulation-contracts`) and never throws for ordinary
 * malformed content — including content that does not actually conform to
 * its declared TypeScript type at runtime (e.g. raw JSON). This is the one
 * package allowed to join `mission-domain`'s and `photography-domain`'s
 * intentionally-opaque cross-package string references (subject ids, zone
 * ids, photography objective ids) against real `location-domain` /
 * `photography-domain` content — see those packages' module docs for why
 * they deliberately don't do this themselves.
 */

export type { LocationValidationContext, MissionValidationContext } from './context';

export { validateLocationDefinition } from './validate-location';

export { validateMissionDefinition } from './validate-mission';

/** Re-exported from `@fpv/photography-domain` for a single validation entry point. */
export { validatePhotographyObjective } from '@fpv/photography-domain';

export { validateAll } from './validate-all';
export type { ValidateAllInput } from './validate-all';

/**
 * Boundary containment geometry, shared with mission runtime boundary
 * evaluation so validation and runtime never diverge on "inside" semantics.
 */
export {
  pointInAabb,
  pointInBoundaryShape,
  pointInObb,
  pointInPolygonPrism,
  pointInSphere,
} from './geometry';
