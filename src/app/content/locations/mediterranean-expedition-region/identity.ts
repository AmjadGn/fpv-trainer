/**
 * Stable identity constants for the Mediterranean Expedition Region package.
 * Coastal Ruins is a playable subregion — not a competing top-level package.
 */

export const MEDITERRANEAN_LOCATION_ID = 'mediterranean-expedition-region' as const;
export const MEDITERRANEAN_PACKAGE_VERSION = '1.0.0' as const;
export const MEDITERRANEAN_COMPATIBILITY_VERSION = '1.0.0' as const;
export const MEDITERRANEAN_RUNTIME_COMPAT_MIN = '1.0.0' as const;

/** First playable subregion / mission area / landmark cluster. */
export const COASTAL_RUINS_SUBREGION_ID = 'coastal-ruins' as const;

/**
 * Fixed authored seed for deterministic proxy geometry.
 * Stored in the location package so gameplay geometry never drifts by session.
 */
export const COASTAL_RUINS_AUTHORED_SEED = 0x4d45_5249; // "MERI"

export const LOCATION_DISPLAY_NAME = 'Mediterranean Expedition Region';
export const COASTAL_RUINS_DISPLAY_NAME = 'Coastal Ruins';

export const MISSION_ID_COASTAL_RUINS_SURVEY = 'coastal-ruins-survey' as const;
export const MISSION_TITLE_COASTAL_RUINS_SURVEY = 'Coastal Ruins Survey';

export const SUBJECT_IDS = {
  stoneSeaArch: 'subject-stone-sea-arch',
  ruinedLookout: 'subject-ruined-lookout',
  cliffsideRuin: 'subject-cliffside-ruin',
} as const;

export const LANDMARK_IDS = {
  stoneSeaArch: 'landmark-stone-sea-arch',
  ruinedLookout: 'landmark-ruined-lookout',
  cliffsideRuin: 'landmark-cliffside-ruin',
} as const;

export const ZONE_IDS = {
  coastalRuinsMission: 'zone-coastal-ruins-mission',
  archObjective: 'zone-arch-objective',
  lookoutObjective: 'zone-lookout-objective',
  cliffObjective: 'zone-cliff-objective',
  shorelineRoute: 'zone-shoreline-route',
} as const;

export const SPAWN_IDS = {
  main: 'spawn-coastal-ruins-main',
} as const;

export const RESTART_IDS = {
  main: 'restart-coastal-ruins-main',
} as const;

export const ASSET_IDS = {
  terrainVisual: 'asset-mer-terrain-visual',
  ruinsVisual: 'asset-mer-ruins-visual',
  rocksVisual: 'asset-mer-rocks-visual',
  decorVisual: 'asset-mer-decor-visual',
  terrainCollision: 'asset-mer-terrain-collision',
  archCollision: 'asset-mer-arch-collision',
  towerCollision: 'asset-mer-tower-collision',
  wallsCollision: 'asset-mer-walls-collision',
  rocksCollision: 'asset-mer-rocks-collision',
  cliffCollision: 'asset-mer-cliff-collision',
  boundaryCollision: 'asset-mer-boundary-collision',
} as const;

export const PROVENANCE_IDS = {
  package: 'prov-mer-package-v1',
  proxyGeometry: 'prov-mer-proxy-geometry-v1',
} as const;
