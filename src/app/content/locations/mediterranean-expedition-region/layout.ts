/**
 * Authored Coastal Ruins layout parameters.
 * All gameplay-critical positions are explicit — not random at runtime.
 * Decorative density may vary by quality tier; collision/spawn/subject poses do not.
 */

import { COASTAL_RUINS_AUTHORED_SEED, COASTAL_RUINS_SUBREGION_ID } from './identity';

export const IDENTITY_QUAT = { x: 0, y: 0, z: 0, w: 1 } as const;

/** World extents for the Coastal Ruins playable pocket (meters). */
export const COASTAL_RUINS_LAYOUT = {
  subregionId: COASTAL_RUINS_SUBREGION_ID,
  authoredSeed: COASTAL_RUINS_AUTHORED_SEED,

  /** Hard boundary AABB (must contain spawn/restart). */
  hardBounds: {
    min: { x: -90, y: -5, z: -110 },
    max: { x: 90, y: 80, z: 70 },
  },
  softWarningBounds: {
    min: { x: -78, y: -2, z: -98 },
    max: { x: 78, y: 70, z: 58 },
  },
  playableBounds: {
    min: { x: -70, y: 0, z: -90 },
    max: { x: 70, y: 60, z: 50 },
  },

  altitude: { minMeters: 0, maxMeters: 55 },

  /** Safe spawn facing -Z toward the sea arch and ruins. */
  spawn: {
    position: { x: 0, y: 2.2, z: 28 },
    orientation: IDENTITY_QUAT,
  },
  restart: {
    position: { x: 4, y: 2.2, z: 24 },
    orientation: IDENTITY_QUAT,
  },

  /** Elevated photography vantage (decorative landmark + optional spawn hint). */
  elevatedVantage: {
    position: { x: 18, y: 12, z: 8 },
  },

  /** Cliff edge running roughly along X near z = -5. */
  cliff: {
    center: { x: 0, y: 6, z: -8 },
    lengthX: 80,
    heightY: 14,
    depthZ: 6,
  },

  /** Open sea-facing flight space south of the cliff (negative Z). */
  seaSpace: {
    center: { x: 0, y: 8, z: -55 },
    halfExtents: { x: 55, y: 20, z: 35 },
  },

  /** Stone sea arch — primary photography subject. */
  stoneArch: {
    position: { x: -12, y: 0, z: -48 },
    outerHalfExtents: { x: 5.5, y: 7, z: 2.2 },
    openingHalfExtents: { x: 2.4, y: 3.5, z: 2.5 },
    openingCenterY: 3.6,
  },

  /** Ruined lookout / broken tower. */
  lookoutTower: {
    position: { x: 28, y: 0, z: -22 },
    baseHalfExtents: { x: 2.2, y: 1.2, z: 2.2 },
    shaftHalfExtents: { x: 1.4, y: 5.5, z: 1.4 },
    shaftCenterY: 6.5,
  },

  /** Cliffside ruin composition. */
  cliffsideRuin: {
    position: { x: -32, y: 8, z: -6 },
    wallHalfExtents: { x: 6, y: 3.5, z: 0.7 },
  },

  /** Ruined stone walls cluster. */
  walls: [
    { position: { x: -8, y: 1.5, z: -18 }, halfExtents: { x: 8, y: 1.5, z: 0.55 } },
    { position: { x: 6, y: 1.8, z: -26 }, halfExtents: { x: 0.55, y: 1.8, z: 6 } },
    { position: { x: 14, y: 1.4, z: -14 }, halfExtents: { x: 5, y: 1.4, z: 0.5 } },
  ] as const,

  /** Narrow rock passage. */
  rockPassage: {
    left: { position: { x: -4, y: 2, z: -34 }, halfExtents: { x: 1.6, y: 2.5, z: 4 } },
    right: { position: { x: 4, y: 2, z: -34 }, halfExtents: { x: 1.6, y: 2.5, z: 4 } },
  },

  /** Major rocks (authoritative obstacles). */
  majorRocks: [
    { position: { x: -22, y: 1.5, z: -38 }, halfExtents: { x: 2.5, y: 1.5, z: 2.2 } },
    { position: { x: 18, y: 1.2, z: -42 }, halfExtents: { x: 2.1, y: 1.2, z: 1.8 } },
    { position: { x: 8, y: 1.8, z: -58 }, halfExtents: { x: 3.0, y: 1.8, z: 2.4 } },
  ] as const,

  /** Low-altitude shoreline route centerline samples (advisory). */
  shorelineRoute: {
    center: { x: 0, y: 2, z: -8 },
    halfExtents: { x: 40, y: 4, z: 6 },
  },

  /** Terrain ground plane for Coastal Ruins pocket. */
  terrain: {
    position: { x: 0, y: -0.25, z: -20 },
    halfExtents: { x: 85, y: 0.25, z: 95 },
  },

  /** Decorative non-authoritative placements (visual density scales by tier). */
  decorativeRockCountByTier: {
    low: 4,
    medium: 10,
    high: 18,
  } as const,
} as const;

export type CoastalRuinsLayout = typeof COASTAL_RUINS_LAYOUT;
