import { describe, expect, it } from 'vitest';
import { SIMULATOR_COORDINATE_SYSTEM_V1 } from '@fpv/simulation-contracts';
import {
  asAssetId,
  asLocationId,
  asPhotographySubjectId,
  asSpawnPointId,
  asZoneId,
  checkLocationCompatibility,
  createLocationDefinition,
  LOCATION_SCHEMA_VERSION,
  type CreateLocationDefinitionInput,
  type PhotographySubjectDefinition,
  type Zone,
} from './index';
import * as locationDomain from './index';

function buildMinimalInput(
  overrides: Partial<CreateLocationDefinitionInput> = {},
): CreateLocationDefinitionInput {
  const zone: Zone = {
    id: asZoneId('zone-overlook'),
    kind: 'objective',
    shape: { kind: 'sphere', sphere: { center: { x: 0, y: 0, z: 0 }, radiusMeters: 20 } },
  };

  const subject: PhotographySubjectDefinition = {
    id: asPhotographySubjectId('subject-lighthouse'),
    displayName: 'Old Lighthouse',
    worldPose: { position: { x: 10, y: 0, z: 10 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    subjectBounds: {
      kind: 'aabb',
      aabb: { min: { x: 8, y: 0, z: 8 }, max: { x: 12, y: 15, z: 12 } },
    },
    semanticTags: ['landmark', 'coastal'],
    scoringAnchor: { x: 10, y: 7, z: 10 },
    visibilitySamplePoints: [
      { x: 10, y: 7, z: 10 },
      { x: 10, y: 12, z: 10 },
    ],
    preferredViewingDirections: [{ x: 0, y: 0, z: -1 }],
    allowedViewingSides: ['front', 'any'],
    boundsVersion: '1.0.0',
    metadataVersion: '1.0.0',
  };

  return {
    locationId: 'coastal-cliffs',
    packageVersion: '1.0.0',
    compatibilityVersion: '1.0.0',
    display: { name: 'Coastal Cliffs', summary: 'A curated coastal training location.' },
    realWorldInspiration: { region: 'Mediterranean coast', notes: 'Inspired by cliffside ruins.' },
    worldOrigin: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    playableBoundary: {
      shape: { kind: 'sphere', sphere: { center: { x: 0, y: 0, z: 0 }, radiusMeters: 500 } },
    },
    hardBoundary: {
      shape: { kind: 'sphere', sphere: { center: { x: 0, y: 0, z: 0 }, radiusMeters: 550 } },
    },
    altitudeConstraints: { minMeters: 0, maxMeters: 200 },
    visualScene: {
      modelAssetIds: [asAssetId('visual-terrain'), asAssetId('visual-lighthouse')],
      textureAssetIds: [asAssetId('texture-rock-albedo')],
    },
    collisionScene: {
      terrainCollisionAssetId: asAssetId('collision-terrain'),
      obstacleCollisionAssetIds: [asAssetId('collision-lighthouse')],
      requiresTerrainCollision: true,
    },
    gameplaySpatial: {
      zones: [zone],
      altitudeBands: [
        { label: 'low-corridor', range: { minMeters: 0, maxMeters: 30 } },
      ],
      spawnPoints: [
        {
          id: asSpawnPointId('spawn-main'),
          pose: { position: { x: 0, y: 1, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
        },
      ],
      restartPoints: [],
    },
    photographySubjects: [subject],
    lighting: {
      directional: {
        direction: { x: -0.3, y: -0.8, z: -0.5 },
        intensity: 3.2,
        color: { r: 1, g: 0.95, b: 0.85 },
      },
      ambient: { intensity: 0.4, color: { r: 0.6, g: 0.7, b: 0.9 } },
    },
    sky: { mode: 'clear' },
    supportedQualityTiers: ['low', 'medium', 'high'],
    performanceMetadata: { estimatedDrawCalls: 800, estimatedTriangles: 1_200_000 },
    runtimeCompatibility: { minRuntimeCompatibilityVersion: '1.0.0' },
    provenanceRecordIds: [],
    assets: [
      {
        kind: 'visual-model',
        id: asAssetId('visual-lighthouse'),
        packageRelativeUri: 'models/lighthouse.glb',
        contentType: 'model/gltf-binary',
        checksum: { algorithm: 'sha256', hex: 'a'.repeat(64) },
        classification: 'required',
        compressedSizeBytesEstimate: 500_000,
        qualityTierAvailability: ['low', 'medium', 'high'],
      },
      {
        kind: 'collision-mesh',
        id: asAssetId('collision-lighthouse'),
        packageRelativeUri: 'collision/lighthouse.col.bin',
        contentType: 'application/octet-stream',
        checksum: { algorithm: 'sha256', hex: 'b'.repeat(64) },
        classification: 'required',
        compressedSizeBytesEstimate: 20_000,
        qualityTierAvailability: ['low', 'medium', 'high'],
      },
    ],
    ...overrides,
  };
}

describe('ids: branding', () => {
  it('brands non-empty strings for each id type', () => {
    expect(asLocationId('coastal-cliffs') as unknown as string).toBe('coastal-cliffs');
    expect(asZoneId('zone-1') as unknown as string).toBe('zone-1');
    expect(asAssetId('asset-1') as unknown as string).toBe('asset-1');
    expect(asPhotographySubjectId('subject-1') as unknown as string).toBe('subject-1');
    expect(asSpawnPointId('spawn-1') as unknown as string).toBe('spawn-1');
  });

  it('throws on empty-string ids (programmer misuse), not silent acceptance', () => {
    expect(() => asLocationId('')).toThrow();
    expect(() => asZoneId('')).toThrow();
    expect(() => asAssetId('')).toThrow();
  });
});

describe('createLocationDefinition: happy path', () => {
  it('assembles a well-formed, frozen LocationDefinition', () => {
    const location = createLocationDefinition(buildMinimalInput());

    expect(location.identity.locationId as unknown as string).toBe('coastal-cliffs');
    expect(location.identity.schemaVersion as unknown as string).toBe(LOCATION_SCHEMA_VERSION);
    expect(location.display.name).toBe('Coastal Cliffs');
    expect(location.photographySubjects).toHaveLength(1);
    expect(location.gameplaySpatial.zones).toHaveLength(1);
    expect(Object.isFrozen(location)).toBe(true);
  });

  it('defaults schemaVersion to LOCATION_SCHEMA_VERSION when omitted', () => {
    const location = createLocationDefinition(buildMinimalInput());
    expect(location.identity.schemaVersion as unknown as string).toBe('1.0.0');
  });

  it('defensively copies arrays so caller mutation cannot reach the returned aggregate', () => {
    const input = buildMinimalInput();
    const zonesRef = input.gameplaySpatial.zones;
    const location = createLocationDefinition(input);
    expect(location.gameplaySpatial.zones).not.toBe(zonesRef);
    expect(location.gameplaySpatial.zones).toEqual(zonesRef);
  });
});

describe('coordinate system field', () => {
  it('is present and defaults to SIMULATOR_COORDINATE_SYSTEM_V1', () => {
    const location = createLocationDefinition(buildMinimalInput());
    expect(location.coordinateSystem).toEqual(SIMULATOR_COORDINATE_SYSTEM_V1);
    expect(location.coordinateSystem.version).toBe('1.0.0');
  });
});

describe('visual vs collision scene separation', () => {
  it('keeps visualScene and collisionScene as independent fields with independent asset ids', () => {
    const location = createLocationDefinition(buildMinimalInput());

    expect(location.visualScene.modelAssetIds).toContain(asAssetId('visual-lighthouse'));
    expect(location.collisionScene.obstacleCollisionAssetIds).toContain(
      asAssetId('collision-lighthouse'),
    );
    // The two scenes never share the same asset id lists / references.
    expect(location.visualScene).not.toBe(location.collisionScene as unknown);
    expect(location.visualScene.modelAssetIds).not.toEqual(
      location.collisionScene.obstacleCollisionAssetIds,
    );
    expect(location.collisionScene.requiresTerrainCollision).toBe(true);
  });
});

describe('quality tiers do not need to mutate gameplay-critical fields', () => {
  it('produces identical zones/spawnPoints/photographySubjects across different quality-tier sets', () => {
    const lowOnly = createLocationDefinition(
      buildMinimalInput({ supportedQualityTiers: ['low'] }),
    );
    const allTiers = createLocationDefinition(
      buildMinimalInput({ supportedQualityTiers: ['low', 'medium', 'high'] }),
    );

    expect(lowOnly.supportedQualityTiers).not.toEqual(allTiers.supportedQualityTiers);
    expect(lowOnly.gameplaySpatial).toEqual(allTiers.gameplaySpatial);
    expect(lowOnly.photographySubjects).toEqual(allTiers.photographySubjects);
    expect(lowOnly.playableBoundary).toEqual(allTiers.playableBoundary);
    expect(lowOnly.hardBoundary).toEqual(allTiers.hardBoundary);
  });
});

describe('checkLocationCompatibility', () => {
  it('reports compatible when coordinate system and runtime version both match', () => {
    const location = createLocationDefinition(buildMinimalInput());
    const result = checkLocationCompatibility(location, {
      runtimeCompatibilityVersion: '1.0.0',
      coordinateSystemVersion: '1.0.0',
    });
    expect(result.status).toBe('compatible');
  });

  it('rejects a runtime on a different coordinate system version', () => {
    const location = createLocationDefinition(buildMinimalInput());
    const result = checkLocationCompatibility(location, {
      runtimeCompatibilityVersion: '1.0.0',
      coordinateSystemVersion: '2.0.0',
    });
    expect(result.status).toBe('incompatible');
    if (result.status === 'incompatible') {
      expect(result.issues.some((issue) => issue.code === 'LOCATION_COORDINATE_SYSTEM_VERSION_MISMATCH')).toBe(
        true,
      );
    }
  });

  it('rejects a runtime below the minimum required compatibility version', () => {
    const location = createLocationDefinition(
      buildMinimalInput({ runtimeCompatibility: { minRuntimeCompatibilityVersion: '1.5.0' } }),
    );
    const result = checkLocationCompatibility(location, {
      runtimeCompatibilityVersion: '1.2.0',
      coordinateSystemVersion: '1.0.0',
    });
    expect(result.status).toBe('incompatible');
    if (result.status === 'incompatible') {
      expect(result.issues.some((issue) => issue.code === 'LOCATION_RUNTIME_VERSION_INCOMPATIBLE')).toBe(
        true,
      );
    }
  });
});

describe('no fallback-flat registration', () => {
  it('does not export any fallback/placeholder location id or constant', () => {
    const exportedNames = Object.keys(locationDomain);
    for (const name of exportedNames) {
      expect(name.toLowerCase()).not.toContain('fallback');
    }
  });

  it('never assembles a location whose id is the application fallback id', () => {
    // This package has no knowledge of `FALLBACK_ENVIRONMENT_ID` and must
    // never hardcode it anywhere in construction logic.
    const location = createLocationDefinition(buildMinimalInput());
    expect(location.identity.locationId as unknown as string).not.toBe('fallback-flat');
  });
});
