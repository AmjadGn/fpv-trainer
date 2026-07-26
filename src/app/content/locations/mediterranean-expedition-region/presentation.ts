/**
 * Presentation metadata and performance budgets for Mediterranean package.
 */

export const MEDITERRANEAN_PERFORMANCE_BUDGETS = {
  low: {
    estimatedDrawCalls: 28,
    estimatedTriangles: 8_000,
    decorativeRockCount: 4,
  },
  medium: {
    estimatedDrawCalls: 40,
    estimatedTriangles: 16_000,
    decorativeRockCount: 10,
  },
  high: {
    estimatedDrawCalls: 56,
    estimatedTriangles: 28_000,
    decorativeRockCount: 18,
  },
} as const;

export const LOCATION_RUNTIME_DIAG_KEYS = [
  'visualObjectCount',
  'geometryCount',
  'materialCount',
  'textureCount',
  'colliderCount',
  'spatialQueryReady',
  'locationGeneration',
  'packageId',
  'packageVersion',
] as const;
