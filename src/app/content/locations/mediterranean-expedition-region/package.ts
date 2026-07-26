import {
  asAssetId,
  createLocationDefinition,
  type LocationDefinition,
} from '@fpv/location-domain';

import { MEDITERRANEAN_ASSETS } from './assets';
import {
  ASSET_IDS,
  COASTAL_RUINS_AUTHORED_SEED,
  COASTAL_RUINS_SUBREGION_ID,
  LOCATION_DISPLAY_NAME,
  MEDITERRANEAN_COMPATIBILITY_VERSION,
  MEDITERRANEAN_LOCATION_ID,
  MEDITERRANEAN_PACKAGE_VERSION,
  MEDITERRANEAN_RUNTIME_COMPAT_MIN,
  PROVENANCE_IDS,
} from './identity';
import { IDENTITY_QUAT } from './layout';
import {
  MEDITERRANEAN_GAMEPLAY_SPATIAL,
  MEDITERRANEAN_HARD_BOUNDARY,
  MEDITERRANEAN_PLAYABLE_BOUNDARY,
  MEDITERRANEAN_SOFT_WARNING_BOUNDARY,
} from './spatial';
import { COASTAL_RUINS_SUBJECTS } from './subjects';

/**
 * Versioned Mediterranean Expedition Region location package.
 * Coastal Ruins is authored as the first playable subregion inside this package.
 */
export function createMediterraneanExpeditionRegionLocation(): LocationDefinition {
  return createLocationDefinition({
    locationId: MEDITERRANEAN_LOCATION_ID,
    packageVersion: MEDITERRANEAN_PACKAGE_VERSION,
    compatibilityVersion: MEDITERRANEAN_COMPATIBILITY_VERSION,
    display: {
      name: LOCATION_DISPLAY_NAME,
      summary:
        'Mediterranean-inspired expedition region. First playable subregion: Coastal Ruins (proxy-quality repository content).',
      regionLabel: 'Mediterranean',
    },
    realWorldInspiration: {
      region: 'Eastern Mediterranean coastal cliffs',
      notes:
        'Fictionalized cliffside ruins and sea arches inspired by Mediterranean limestone coasts. Not a real-world site replica.',
      approximateLatLon: { lat: 36.4, lon: 25.4 },
    },
    worldOrigin: {
      position: { x: 0, y: 0, z: 0 },
      orientation: IDENTITY_QUAT,
    },
    playableBoundary: MEDITERRANEAN_PLAYABLE_BOUNDARY,
    softWarningBoundary: MEDITERRANEAN_SOFT_WARNING_BOUNDARY,
    hardBoundary: MEDITERRANEAN_HARD_BOUNDARY,
    altitudeConstraints: { minMeters: 0, maxMeters: 55 },
    visualScene: {
      terrainVisualAssetId: asAssetId(ASSET_IDS.terrainVisual),
      modelAssetIds: [
        asAssetId(ASSET_IDS.terrainVisual),
        asAssetId(ASSET_IDS.ruinsVisual),
        asAssetId(ASSET_IDS.rocksVisual),
        asAssetId(ASSET_IDS.decorVisual),
      ],
      textureAssetIds: [],
    },
    collisionScene: {
      terrainCollisionAssetId: asAssetId(ASSET_IDS.terrainCollision),
      obstacleCollisionAssetIds: [
        asAssetId(ASSET_IDS.archCollision),
        asAssetId(ASSET_IDS.towerCollision),
        asAssetId(ASSET_IDS.wallsCollision),
        asAssetId(ASSET_IDS.rocksCollision),
        asAssetId(ASSET_IDS.cliffCollision),
        asAssetId(ASSET_IDS.boundaryCollision),
      ],
      requiresTerrainCollision: true,
    },
    gameplaySpatial: MEDITERRANEAN_GAMEPLAY_SPATIAL,
    photographySubjects: COASTAL_RUINS_SUBJECTS,
    lighting: {
      directional: {
        direction: { x: -0.35, y: -0.82, z: -0.45 },
        intensity: 3.4,
        color: { r: 1, g: 0.94, b: 0.82 },
      },
      ambient: {
        intensity: 0.42,
        color: { r: 0.55, g: 0.68, b: 0.88 },
      },
    },
    sky: {
      mode: 'clear',
      zenithColor: { r: 0.35, g: 0.55, b: 0.85 },
      horizonColor: { r: 0.78, g: 0.72, b: 0.58 },
      turbidity: 2.5,
    },
    supportedQualityTiers: ['low', 'medium', 'high'],
    performanceMetadata: {
      estimatedDrawCalls: 48,
      estimatedTriangles: 24_000,
      streamingBudgetBytes: 512_000,
    },
    runtimeCompatibility: {
      minRuntimeCompatibilityVersion: MEDITERRANEAN_RUNTIME_COMPAT_MIN,
    },
    provenanceRecordIds: [PROVENANCE_IDS.package, PROVENANCE_IDS.proxyGeometry],
    assets: MEDITERRANEAN_ASSETS,
  });
}

/** Presentation metadata for Expeditions UI (not part of LocationDefinition aggregate). */
export const MEDITERRANEAN_PRESENTATION = {
  locationId: MEDITERRANEAN_LOCATION_ID,
  packageVersion: MEDITERRANEAN_PACKAGE_VERSION,
  primarySubregionId: COASTAL_RUINS_SUBREGION_ID,
  authoredSeed: COASTAL_RUINS_AUTHORED_SEED,
  contentQuality: 'proxy' as const,
  captureScoringEnabled: false,
  notes: [
    'Proxy-quality repository-owned geometry.',
    'Photography capture/scoring loop is not complete in Checkpoint 4.',
    'Not final production art.',
  ],
} as const;

let cached: LocationDefinition | null = null;

/** Immutable singleton package instance. */
export function getMediterraneanExpeditionRegionLocation(): LocationDefinition {
  if (!cached) {
    cached = createMediterraneanExpeditionRegionLocation();
  }
  return cached;
}
