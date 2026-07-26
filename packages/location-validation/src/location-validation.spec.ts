import { describe, expect, it } from 'vitest';
import { asElapsedTicks, SIMULATOR_COORDINATE_SYSTEM_V1 } from '@fpv/simulation-contracts';
import {
  asAssetId,
  asLandmarkId,
  asPhotographySubjectId,
  asProvenanceRecordId,
  asRestartPointId,
  asSpawnPointId,
  asZoneId,
  createLocationDefinition,
  type AssetId,
  type CreateLocationDefinitionInput,
  type LocationDefinition,
  type PhotographySubjectDefinition,
  type Zone,
} from '@fpv/location-domain';
import {
  asMissionCompatibilityVersion,
  asMissionId,
  asMissionSchemaVersion,
  asMissionVersion,
  asObjectiveId,
  createMissionDefinition,
  type CreateMissionDefinitionInput,
  type MissionAircraftCompatibilityPolicy,
  type MissionDefinition,
} from '@fpv/mission-domain';
import {
  asPhotographyObjectiveId,
  asSubjectId,
  createDefaultPhotographyScoringPolicy,
  type PhotographyObjectiveDefinition,
  type PhotographyScoringPolicy,
} from '@fpv/photography-domain';
import {
  validateAll,
  validateLocationDefinition,
  validateMissionDefinition,
  validatePhotographyObjective,
  type LocationValidationContext,
  type MissionValidationContext,
} from './index';

// ---------------------------------------------------------------------------
// Fixtures — minimal, synthetic, not tied to any specific curated content.
// ---------------------------------------------------------------------------

function buildZone(overrides: Partial<Zone> = {}): Zone {
  return {
    id: asZoneId('zone-alpha'),
    kind: 'objective',
    shape: { kind: 'sphere', sphere: { center: { x: 0, y: 0, z: 0 }, radiusMeters: 15 } },
    ...overrides,
  } as Zone;
}

function buildSubject(overrides: Partial<PhotographySubjectDefinition> = {}): PhotographySubjectDefinition {
  return {
    id: asPhotographySubjectId('subject-tower'),
    displayName: 'Test Tower',
    worldPose: { position: { x: 5, y: 0, z: 5 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    subjectBounds: { kind: 'aabb', aabb: { min: { x: 3, y: 0, z: 3 }, max: { x: 7, y: 10, z: 7 } } },
    semanticTags: ['tower'],
    scoringAnchor: { x: 5, y: 5, z: 5 },
    visibilitySamplePoints: [{ x: 5, y: 5, z: 5 }],
    preferredViewingDirections: [{ x: 0, y: 0, z: -1 }],
    allowedViewingSides: ['front', 'any'],
    landmarkId: asLandmarkId('landmark-tower'),
    collisionQueryRefIds: ['asset-obstacle-collision'],
    boundsVersion: '1.0.0',
    metadataVersion: '1.0.0',
    ...overrides,
  };
}

function buildLocationInput(overrides: Partial<CreateLocationDefinitionInput> = {}): CreateLocationDefinitionInput {
  return {
    locationId: 'loc-test',
    packageVersion: '1.0.0',
    compatibilityVersion: '1.0.0',
    display: { name: 'Test Location', summary: 'A minimal synthetic fixture location.' },
    realWorldInspiration: { region: 'Nowhere', notes: 'Synthetic fixture, not real-world content.' },
    worldOrigin: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    playableBoundary: {
      shape: { kind: 'sphere', sphere: { center: { x: 0, y: 0, z: 0 }, radiusMeters: 100 } },
    },
    hardBoundary: {
      shape: { kind: 'sphere', sphere: { center: { x: 0, y: 0, z: 0 }, radiusMeters: 120 } },
    },
    altitudeConstraints: { minMeters: 0, maxMeters: 100 },
    visualScene: {
      terrainVisualAssetId: asAssetId('asset-terrain-visual'),
      modelAssetIds: [asAssetId('asset-terrain-visual')],
      textureAssetIds: [],
    },
    collisionScene: {
      terrainCollisionAssetId: asAssetId('asset-terrain-collision'),
      obstacleCollisionAssetIds: [asAssetId('asset-obstacle-collision')],
      requiresTerrainCollision: true,
    },
    gameplaySpatial: {
      zones: [buildZone()],
      altitudeBands: [{ label: 'low-corridor', range: { minMeters: 0, maxMeters: 30 } }],
      spawnPoints: [
        {
          id: asSpawnPointId('spawn-main'),
          pose: { position: { x: 0, y: 1, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
        },
      ],
      restartPoints: [
        {
          id: asRestartPointId('restart-main'),
          pose: { position: { x: 1, y: 1, z: 1 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
        },
      ],
    },
    photographySubjects: [buildSubject()],
    lighting: {
      directional: { direction: { x: -0.3, y: -0.8, z: -0.5 }, intensity: 3, color: { r: 1, g: 1, b: 1 } },
      ambient: { intensity: 0.3, color: { r: 1, g: 1, b: 1 } },
    },
    sky: { mode: 'clear' },
    supportedQualityTiers: ['low', 'medium', 'high'],
    performanceMetadata: { estimatedDrawCalls: 500, estimatedTriangles: 100_000, streamingBudgetBytes: 1_000_000 },
    runtimeCompatibility: { minRuntimeCompatibilityVersion: '1.0.0' },
    provenanceRecordIds: ['prov-1'],
    assets: [
      {
        kind: 'visual-model',
        id: asAssetId('asset-terrain-visual'),
        packageRelativeUri: 'models/terrain.glb',
        contentType: 'model/gltf-binary',
        checksum: { algorithm: 'sha256', hex: 'a'.repeat(64) },
        classification: 'required',
        compressedSizeBytesEstimate: 500_000,
        qualityTierAvailability: ['low', 'medium', 'high'],
        provenanceRecordId: asProvenanceRecordId('prov-1'),
      },
      {
        kind: 'terrain-collision',
        id: asAssetId('asset-terrain-collision'),
        packageRelativeUri: 'collision/terrain.col.bin',
        contentType: 'application/octet-stream',
        checksum: { algorithm: 'sha256', hex: 'b'.repeat(64) },
        classification: 'required',
        compressedSizeBytesEstimate: 20_000,
        qualityTierAvailability: ['low', 'medium', 'high'],
      },
      {
        kind: 'collision-mesh',
        id: asAssetId('asset-obstacle-collision'),
        packageRelativeUri: 'collision/tower.col.bin',
        contentType: 'application/octet-stream',
        checksum: { algorithm: 'sha256', hex: 'c'.repeat(64) },
        classification: 'required',
        compressedSizeBytesEstimate: 10_000,
        qualityTierAvailability: ['low', 'medium', 'high'],
      },
    ],
    ...overrides,
  };
}

function buildLocation(overrides: Partial<CreateLocationDefinitionInput> = {}): LocationDefinition {
  return createLocationDefinition(buildLocationInput(overrides));
}

const photoObjectiveId = asObjectiveId('obj-photo');
const reachObjectiveId = asObjectiveId('obj-reach');

function buildMissionInput(overrides: Partial<CreateMissionDefinitionInput> = {}): CreateMissionDefinitionInput {
  return {
    metadata: { title: 'Tower Survey', description: 'Photograph the tower and reach the zone.' },
    missionId: asMissionId('mission-tower-survey'),
    version: asMissionVersion('1.0.0'),
    compatibilityVersion: asMissionCompatibilityVersion('1.0.0'),
    requiredLocationId: 'loc-test',
    locationVersionRange: { min: 1, max: 1 },
    briefing: { summary: 'Fly to the tower, photograph it, then reach the zone.' },
    aircraftCompatibilityPolicy: { allowedCategories: ['freestyle'], requireCamera: true },
    objectives: [
      {
        kind: 'photography',
        objectiveId: photoObjectiveId,
        version: asMissionVersion('1.0.0'),
        required: true,
        photographyObjectiveId: 'photo-tower-01',
      },
      {
        kind: 'reach_zone',
        objectiveId: reachObjectiveId,
        version: asMissionVersion('1.0.0'),
        required: true,
        zoneId: 'zone-alpha',
      },
    ],
    grouping: { mode: 'sequential', requiredObjectiveIds: [photoObjectiveId, reachObjectiveId] },
    completionPolicy: { mode: 'all_required' },
    failurePolicy: {
      crash: { enabled: true },
      outOfBoundsAfterGrace: { enabled: true, graceTicks: asElapsedTicks(100) },
      timeout: { enabled: true },
      infrastructure: { enabled: true },
      prohibitedZone: { enabled: false, zoneIds: [] },
    },
    timePolicy: { hardLimitTicks: asElapsedTicks(10_000) },
    scoreAggregationPolicy: { requiredWeight: 1, optionalBonusWeight: 0.5, timeBonusEnabled: false, maxScore: 100 },
    ...overrides,
  };
}

function buildMission(overrides: Partial<CreateMissionDefinitionInput> = {}): MissionDefinition {
  return createMissionDefinition(buildMissionInput(overrides));
}

function buildPhotoObjective(overrides: Partial<PhotographyObjectiveDefinition> = {}): PhotographyObjectiveDefinition {
  return {
    objectiveId: asPhotographyObjectiveId('photo-tower-01'),
    version: '1.0.0',
    requiredSubjectIds: [asSubjectId('subject-tower')],
    minRequiredSubjectCount: 1,
    primarySubjectIds: [asSubjectId('subject-tower')],
    visibilityMin: 0.5,
    coverageRange: { min: 0.1, max: 0.8 },
    centeringTarget: { targetAnchor: { u: 0.5, v: 0.5 }, maxCenteringError: 0.3 },
    cameraToSubjectDistanceRange: { min: 5, max: 50 },
    viewingAngleRangeDeg: { min: 0, max: 60 },
    allowedViewingSides: ['front', 'left', 'right'],
    altitudeRange: { minMeters: 0, maxMeters: 50 },
    lineOfSightMin: 0.7,
    obstructionMax: 0.3,
    maxLinearSpeedMps: 10,
    maxBodyAngularSpeedRadps: 2,
    stabilityDurationTicks: asElapsedTicks(30),
    attemptPolicy: { retryable: true },
    ...overrides,
  };
}

function buildScoringPolicy(overrides: Partial<PhotographyScoringPolicy> = {}): PhotographyScoringPolicy {
  return { ...createDefaultPhotographyScoringPolicy(), ...overrides };
}

function fullMissionContext(overrides: Partial<MissionValidationContext> = {}): MissionValidationContext {
  return {
    location: buildLocation(),
    photographyObjectives: [buildPhotoObjective()],
    scoringPolicies: [buildScoringPolicy()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateLocationDefinition
// ---------------------------------------------------------------------------

describe('validateLocationDefinition: happy path', () => {
  it('reports ok with no issues for a well-formed location', () => {
    const report = validateLocationDefinition(buildLocation());
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('works with no context argument at all', () => {
    const report = validateLocationDefinition(buildLocation());
    expect(report.ok).toBe(true);
  });
});

describe('validateLocationDefinition: MISSING_TERRAIN_COLLISION', () => {
  it('flags a missing terrainCollisionAssetId when requiresTerrainCollision is true', () => {
    const location = buildLocation({
      collisionScene: {
        obstacleCollisionAssetIds: [asAssetId('asset-obstacle-collision')],
        requiresTerrainCollision: true,
      },
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('MISSING_TERRAIN_COLLISION');
  });
});

describe('validateLocationDefinition: VISUAL_USED_AS_COLLISION', () => {
  it('rejects a visual-model asset used as terrain collision', () => {
    const location = buildLocation({
      collisionScene: {
        terrainCollisionAssetId: asAssetId('asset-terrain-visual'),
        obstacleCollisionAssetIds: [asAssetId('asset-obstacle-collision')],
        requiresTerrainCollision: true,
      },
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('VISUAL_USED_AS_COLLISION');
  });

  it('rejects a visual-model asset used as an obstacle collision reference', () => {
    const location = buildLocation({
      collisionScene: {
        terrainCollisionAssetId: asAssetId('asset-terrain-collision'),
        obstacleCollisionAssetIds: [asAssetId('asset-terrain-visual')],
        requiresTerrainCollision: true,
      },
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('VISUAL_USED_AS_COLLISION');
  });
});

describe('validateLocationDefinition: COORDINATE_SYSTEM_MISMATCH', () => {
  it('flags a coordinateSystem.version that does not match SIMULATOR_COORDINATE_SYSTEM_V1', () => {
    const location = buildLocation({
      coordinateSystem: { ...SIMULATOR_COORDINATE_SYSTEM_V1, version: '2.0.0' },
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('COORDINATE_SYSTEM_MISMATCH');
  });
});

describe('validateLocationDefinition: MISSING_ASSET', () => {
  it('flags a visualScene.modelAssetIds reference that does not exist', () => {
    const location = buildLocation({
      visualScene: {
        terrainVisualAssetId: asAssetId('asset-terrain-visual'),
        modelAssetIds: [asAssetId('asset-terrain-visual'), asAssetId('asset-does-not-exist')],
        textureAssetIds: [],
      },
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('MISSING_ASSET');
  });

  it('accepts a reference resolved only via context.knownAssetIds', () => {
    const location = buildLocation({
      visualScene: {
        terrainVisualAssetId: asAssetId('asset-terrain-visual'),
        modelAssetIds: [asAssetId('asset-terrain-visual'), asAssetId('asset-external')],
        textureAssetIds: [],
      },
    });
    const report = validateLocationDefinition(location, { knownAssetIds: ['asset-external'] });
    expect(report.issues.map((issue) => issue.code)).not.toContain('MISSING_ASSET');
  });
});

describe('validateLocationDefinition: DUPLICATE_ID / EMPTY_ID', () => {
  it('flags duplicate zone ids', () => {
    const zone = buildZone();
    const location = buildLocation({
      gameplaySpatial: {
        zones: [zone, zone],
        altitudeBands: [],
        spawnPoints: [
          {
            id: asSpawnPointId('spawn-main'),
            pose: { position: { x: 0, y: 1, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
          },
        ],
        restartPoints: [],
      },
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('DUPLICATE_ID');
  });

  it('flags an empty asset id', () => {
    const input = buildLocationInput();
    const location = buildLocation({
      assets: [{ ...input.assets[0]!, id: '' as unknown as AssetId }, ...input.assets.slice(1)],
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('EMPTY_ID');
  });
});

describe('validateLocationDefinition: INVALID_CHECKSUM', () => {
  it('flags a checksum whose hex does not match the sha256 pattern', () => {
    const input = buildLocationInput();
    const location = buildLocation({
      assets: [{ ...input.assets[0]!, checksum: { algorithm: 'sha256', hex: 'not-a-valid-hex-digest' } }, ...input.assets.slice(1)],
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('INVALID_CHECKSUM');
  });

  it('flags a non-sha256 checksum algorithm', () => {
    const input = buildLocationInput();
    const location = buildLocation({
      assets: [
        { ...input.assets[0]!, checksum: { algorithm: 'md5', hex: 'a'.repeat(64) } as unknown as (typeof input.assets)[number]['checksum'] },
        ...input.assets.slice(1),
      ],
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('INVALID_CHECKSUM');
  });
});

describe('validateLocationDefinition: QUALITY_TIER_INCONSISTENT', () => {
  it('flags a required asset missing a supported quality tier variant', () => {
    const input = buildLocationInput();
    const location = buildLocation({
      assets: [{ ...input.assets[0]!, qualityTierAvailability: ['low', 'medium'] }, ...input.assets.slice(1)],
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('QUALITY_TIER_INCONSISTENT');
  });
});

describe('validateLocationDefinition: MISSING_PROVENANCE', () => {
  it('flags an asset provenanceRecordId that is not declared on the location', () => {
    const input = buildLocationInput();
    const location = buildLocation({
      assets: [
        { ...input.assets[0]!, provenanceRecordId: asProvenanceRecordId('prov-does-not-exist') },
        ...input.assets.slice(1),
      ],
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('MISSING_PROVENANCE');
  });

  it('flags a location provenanceRecordId absent from a supplied provenance context', () => {
    const location = buildLocation();
    const report = validateLocationDefinition(location, { provenanceRecords: [{ id: 'some-other-record' }] });
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('MISSING_PROVENANCE');
  });
});

describe('validateLocationDefinition: INVALID_FINITE_NUMBER', () => {
  it('flags a non-finite hardBoundary shape', () => {
    const location = buildLocation({
      hardBoundary: { shape: { kind: 'sphere', sphere: { center: { x: 0, y: 0, z: 0 }, radiusMeters: Number.NaN } } },
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('INVALID_FINITE_NUMBER');
  });
});

describe('validateLocationDefinition: SPAWN_OUTSIDE_HARD_BOUNDS / RESTART_OUTSIDE_HARD_BOUNDS', () => {
  it('flags a spawn point outside the hard boundary sphere', () => {
    const location = buildLocation({
      gameplaySpatial: {
        zones: [buildZone()],
        altitudeBands: [],
        spawnPoints: [
          {
            id: asSpawnPointId('spawn-far'),
            pose: { position: { x: 500, y: 0, z: 500 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
          },
        ],
        restartPoints: [],
      },
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('SPAWN_OUTSIDE_HARD_BOUNDS');
  });

  it('flags a restart point outside the hard boundary sphere', () => {
    const location = buildLocation({
      gameplaySpatial: {
        zones: [buildZone()],
        altitudeBands: [],
        spawnPoints: [],
        restartPoints: [
          {
            id: asRestartPointId('restart-far'),
            pose: { position: { x: -500, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
          },
        ],
      },
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('RESTART_OUTSIDE_HARD_BOUNDS');
  });

  it('accepts spawn/restart points inside an AABB hard boundary', () => {
    const location = buildLocation({
      hardBoundary: { shape: { kind: 'aabb', aabb: { min: { x: -50, y: 0, z: -50 }, max: { x: 50, y: 50, z: 50 } } } },
    });
    const report = validateLocationDefinition(location);
    expect(report.issues.map((issue) => issue.code)).not.toContain('SPAWN_OUTSIDE_HARD_BOUNDS');
    expect(report.issues.map((issue) => issue.code)).not.toContain('RESTART_OUTSIDE_HARD_BOUNDS');
  });
});

describe('validateLocationDefinition: subject checks', () => {
  it('flags a non-finite visibility sample point as INVALID_SAMPLE_POINT', () => {
    const location = buildLocation({
      photographySubjects: [buildSubject({ visibilitySamplePoints: [{ x: Number.NaN, y: 0, z: 0 }] })],
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('INVALID_SAMPLE_POINT');
  });

  it('flags a non-finite subjectBounds shape as INVALID_SUBJECT_BOUNDS', () => {
    const location = buildLocation({
      photographySubjects: [
        buildSubject({ subjectBounds: { kind: 'aabb', aabb: { min: { x: 0, y: 0, z: 0 }, max: { x: Number.POSITIVE_INFINITY, y: 1, z: 1 } } } }),
      ],
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('INVALID_SUBJECT_BOUNDS');
  });

  it('flags an unknown collisionQueryRefIds entry as UNKNOWN_COLLISION_REF', () => {
    const location = buildLocation({
      photographySubjects: [buildSubject({ collisionQueryRefIds: ['asset-does-not-exist'] })],
    });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('UNKNOWN_COLLISION_REF');
  });

  it('flags an unknown landmarkId against a supplied landmark context as UNKNOWN_LANDMARK_REF', () => {
    const location = buildLocation();
    const report = validateLocationDefinition(location, { knownLandmarkIds: ['some-other-landmark'] });
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('UNKNOWN_LANDMARK_REF');
  });

  it('does not check landmarkId existence when no landmark context is supplied', () => {
    const report = validateLocationDefinition(buildLocation());
    expect(report.issues.map((issue) => issue.code)).not.toContain('UNKNOWN_LANDMARK_REF');
  });
});

describe('validateLocationDefinition: INVALID_ALTITUDE_RANGE', () => {
  it('flags an inverted altitudeConstraints range', () => {
    const location = buildLocation({ altitudeConstraints: { minMeters: 100, maxMeters: 0 } });
    const report = validateLocationDefinition(location);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('INVALID_ALTITUDE_RANGE');
  });
});

// ---------------------------------------------------------------------------
// validateMissionDefinition
// ---------------------------------------------------------------------------

describe('validateMissionDefinition: happy path', () => {
  it('reports ok with a fully-populated, consistent context', () => {
    const report = validateMissionDefinition(buildMission(), fullMissionContext());
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('works with no context argument at all (skips cross-reference checks)', () => {
    const report = validateMissionDefinition(buildMission());
    expect(report.ok).toBe(true);
  });
});

describe('validateMissionDefinition: INVALID_SUBJECT_REFERENCE', () => {
  it('flags a required subject id that does not exist on context.location', () => {
    const photoObjective = buildPhotoObjective({
      requiredSubjectIds: [asSubjectId('subject-tower'), asSubjectId('subject-ghost')],
      primarySubjectIds: [asSubjectId('subject-tower')],
      minRequiredSubjectCount: 1,
    });
    const report = validateMissionDefinition(buildMission(), fullMissionContext({ photographyObjectives: [photoObjective] }));
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('INVALID_SUBJECT_REFERENCE');
  });
});

describe('validateMissionDefinition: IMPOSSIBLE_REQUIRED_SUBJECT_COUNT', () => {
  it('flags a minRequiredSubjectCount unreachable given which subjects actually exist at the location', () => {
    const photoObjective = buildPhotoObjective({
      requiredSubjectIds: [asSubjectId('subject-tower'), asSubjectId('subject-ghost')],
      primarySubjectIds: [asSubjectId('subject-tower')],
      minRequiredSubjectCount: 2,
    });
    const report = validateMissionDefinition(buildMission(), fullMissionContext({ photographyObjectives: [photoObjective] }));
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('IMPOSSIBLE_REQUIRED_SUBJECT_COUNT');
  });
});

describe('validateMissionDefinition: UNSUPPORTED_ENDURANCE_CONSTRAINT', () => {
  it('rejects an endurance constraint smuggled into aircraftCompatibilityPolicy', () => {
    const policy = {
      allowedCategories: ['freestyle'],
      enduranceMinutesMin: 20,
    } as unknown as MissionAircraftCompatibilityPolicy;
    const mission = buildMission({ aircraftCompatibilityPolicy: policy });
    const report = validateMissionDefinition(mission, fullMissionContext());
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('UNSUPPORTED_ENDURANCE_CONSTRAINT');
  });
});

describe('validateMissionDefinition: INVALID_SCORE_WEIGHTS', () => {
  it('flags a scoring policy with a negative component weight', () => {
    const brokenPolicy = buildScoringPolicy({
      components: createDefaultPhotographyScoringPolicy().components.map((component) =>
        component.componentId === 'visibility' ? { ...component, maxScore: -5 } : component,
      ),
    });
    const report = validateMissionDefinition(buildMission(), fullMissionContext({ scoringPolicies: [brokenPolicy] }));
    expect(report.ok).toBe(false);
    const codes = report.issues.map((issue) => issue.code);
    expect(codes.some((code) => code === 'INVALID_SCORE_WEIGHTS' || code.startsWith('POLICY_'))).toBe(true);
  });

  it('flags a scoring policy missing a required component', () => {
    const brokenPolicy = buildScoringPolicy({
      components: createDefaultPhotographyScoringPolicy().components.filter((component) => component.componentId !== 'bonus'),
    });
    const report = validateMissionDefinition(buildMission(), fullMissionContext({ scoringPolicies: [brokenPolicy] }));
    expect(report.ok).toBe(false);
    const codes = report.issues.map((issue) => issue.code);
    expect(codes.some((code) => code === 'INVALID_SCORE_WEIGHTS' || code.startsWith('POLICY_'))).toBe(true);
  });
});

describe('validateMissionDefinition: COORDINATE_SYSTEM_MISMATCH (via cross-validated location)', () => {
  it('surfaces the location coordinate-system issue when validating a location context through validateAll', () => {
    const location = buildLocation({ coordinateSystem: { ...SIMULATOR_COORDINATE_SYSTEM_V1, version: '9.9.9' } });
    const report = validateAll({ location, mission: buildMission(), missionContext: fullMissionContext({ location }) });
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('COORDINATE_SYSTEM_MISMATCH');
  });
});

describe('validateMissionDefinition: CONTROLLER_FIELD_IN_MISSION_DEFINITION', () => {
  it('rejects a raw controllerCalibrationVersion field nested in the mission payload', () => {
    const mission = buildMission();
    const tampered = {
      ...mission,
      aircraftCompatibilityPolicy: { ...mission.aircraftCompatibilityPolicy, controllerCalibrationVersion: 'v2' },
    } as unknown as MissionDefinition;
    const report = validateMissionDefinition(tampered, fullMissionContext());
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('CONTROLLER_FIELD_IN_MISSION_DEFINITION');
  });

  it('rejects each of the documented controller/calibration field names', () => {
    const forbiddenFields = ['controllerCalibrationVersion', 'yawInverted', 'rawAxisMapping', 'gamepadAxes', 'calibration'];
    for (const field of forbiddenFields) {
      const mission = buildMission();
      const tampered = { ...mission, [field]: 'unexpected-value' } as unknown as MissionDefinition;
      const report = validateMissionDefinition(tampered);
      expect(report.issues.map((issue) => issue.code)).toContain('CONTROLLER_FIELD_IN_MISSION_DEFINITION');
    }
  });
});

describe('validateMissionDefinition: UNSUPPORTED_VERSION', () => {
  it('flags a schemaVersion whose major version is unsupported', () => {
    const mission = buildMission({ schemaVersion: asMissionSchemaVersion('2.0.0') });
    const report = validateMissionDefinition(mission);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('UNSUPPORTED_VERSION');
  });
});

describe('validateMissionDefinition: DUPLICATE_OBJECTIVE_ID', () => {
  it('flags duplicate objectiveId values in a raw mission payload', () => {
    const mission = buildMission();
    const tampered = {
      ...mission,
      objectives: [...mission.objectives, mission.objectives[0]!],
    } as unknown as MissionDefinition;
    const report = validateMissionDefinition(tampered);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('DUPLICATE_OBJECTIVE_ID');
  });
});

describe('validateMissionDefinition: INVALID_ZONE_REFERENCE', () => {
  it('flags a reach_zone objective referencing a zone absent from context.location', () => {
    const mission = buildMission({
      objectives: [
        {
          kind: 'reach_zone',
          objectiveId: reachObjectiveId,
          version: asMissionVersion('1.0.0'),
          required: true,
          zoneId: 'zone-does-not-exist',
        },
      ],
      grouping: { mode: 'sequential', requiredObjectiveIds: [reachObjectiveId] },
    });
    const report = validateMissionDefinition(mission, { location: buildLocation() });
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('INVALID_ZONE_REFERENCE');
  });
});

describe('validateMissionDefinition: LOCATION_REFERENCE_MISMATCH', () => {
  it('flags a requiredLocationId that does not match context.location', () => {
    const mission = buildMission({ requiredLocationId: 'some-other-location' });
    const report = validateMissionDefinition(mission, { location: buildLocation() });
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('LOCATION_REFERENCE_MISMATCH');
  });
});

describe('public API surface', () => {
  it('exposes every documented top-level export', () => {
    expect(typeof validateLocationDefinition).toBe('function');
    expect(typeof validateMissionDefinition).toBe('function');
    expect(typeof validatePhotographyObjective).toBe('function');
    expect(typeof validateAll).toBe('function');
  });

  it('validatePhotographyObjective is the real re-export from @fpv/photography-domain', () => {
    const report = validatePhotographyObjective(buildPhotoObjective());
    expect(report.ok).toBe(true);
  });

  it('validateAll merges location and mission reports', () => {
    const location = buildLocation();
    const mission = buildMission();
    const report = validateAll({
      location,
      mission,
      missionContext: fullMissionContext({ location }),
    });
    expect(report.ok).toBe(true);
  });
});

describe('no controller/calibration leakage into the validated mission itself', () => {
  it('a well-formed mission fixture never contains controller/calibration terms', () => {
    const mission = buildMission();
    const serialized = JSON.stringify(mission).toLowerCase();
    for (const term of ['controller', 'gamepad', 'inverted', 'calibration', 'rawaxis']) {
      expect(serialized.includes(term)).toBe(false);
    }
  });
});

describe('empty context types satisfy LocationValidationContext / MissionValidationContext', () => {
  it('accepts an entirely empty context object for both validators', () => {
    const locationContext: LocationValidationContext = {};
    const missionContext: MissionValidationContext = {};
    expect(validateLocationDefinition(buildLocation(), locationContext).ok).toBe(true);
    expect(validateMissionDefinition(buildMission(), missionContext).ok).toBe(true);
  });
});
