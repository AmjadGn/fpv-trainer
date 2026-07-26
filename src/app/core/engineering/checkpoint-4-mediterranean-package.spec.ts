import { describe, expect, it } from 'vitest';
import { validateLocationDefinition, validateMissionDefinition } from '@fpv/location-validation';
import { evaluateMissionAircraftCompatibility } from '@fpv/mission-domain';

import {
  COASTAL_RUINS_AUTHORED_SEED,
  COASTAL_RUINS_PHOTO_OBJECTIVES,
  COASTAL_RUINS_SCORING_POLICY,
  COASTAL_RUINS_SUBREGION_ID,
  MEDITERRANEAN_LOCATION_ID,
  MEDITERRANEAN_PACKAGE_VERSION,
  MEDITERRANEAN_PROVENANCE_RECORDS,
  MISSION_ID_COASTAL_RUINS_SURVEY,
  buildCoastalRuinsCollisionDescriptors,
  createCoastalRuinsSurveyMission,
  createMediterraneanExpeditionRegionLocation,
  getMediterraneanExpeditionRegionLocation,
} from '../../content/locations/mediterranean-expedition-region';

describe('Mediterranean Expedition Region package', () => {
  const location = createMediterraneanExpeditionRegionLocation();

  it('validates successfully', () => {
    const report = validateLocationDefinition(location, {
      provenanceRecords: [...MEDITERRANEAN_PROVENANCE_RECORDS],
      knownLandmarkIds: location.photographySubjects
        .map((s) => s.landmarkId)
        .filter((id): id is NonNullable<typeof id> => id !== undefined)
        .map((id) => String(id)),
    });
    expect(report.ok).toBe(true);
  });

  it('has stable package id and versions', () => {
    expect(String(location.identity.locationId)).toBe(MEDITERRANEAN_LOCATION_ID);
    expect(String(location.identity.packageVersion)).toBe(MEDITERRANEAN_PACKAGE_VERSION);
    expect(String(location.identity.schemaVersion)).toBe('1.0.0');
    expect(location.runtimeCompatibility.minRuntimeCompatibilityVersion).toBe('1.0.0');
  });

  it('treats Coastal Ruins as a subregion, not a separate package', () => {
    expect(String(location.identity.locationId)).not.toBe(COASTAL_RUINS_SUBREGION_ID);
    expect(
      location.gameplaySpatial.zones.some(
        (z) => String(z.id) === 'zone-coastal-ruins-mission',
      ),
    ).toBe(true);
    expect(COASTAL_RUINS_SUBREGION_ID).toBe('coastal-ruins');
  });

  it('resolves all asset references', () => {
    const ids = new Set(location.assets.map((a) => String(a.id)));
    for (const id of location.visualScene.modelAssetIds) {
      expect(ids.has(String(id))).toBe(true);
    }
    for (const id of location.collisionScene.obstacleCollisionAssetIds) {
      expect(ids.has(String(id))).toBe(true);
    }
    expect(ids.has(String(location.collisionScene.terrainCollisionAssetId))).toBe(true);
  });

  it('requires terrain collision and keeps visual separate', () => {
    expect(location.collisionScene.requiresTerrainCollision).toBe(true);
    expect(location.collisionScene.terrainCollisionAssetId).toBeDefined();
    expect(String(location.collisionScene.terrainCollisionAssetId)).not.toBe(
      String(location.visualScene.terrainVisualAssetId),
    );
    const visualKinds = location.assets
      .filter((a) => location.visualScene.modelAssetIds.some((id) => String(id) === String(a.id)))
      .map((a) => a.kind);
    expect(visualKinds.every((k) => k === 'visual-model')).toBe(true);
  });

  it('keeps spawn and restart points inside hard bounds', () => {
    const report = validateLocationDefinition(location);
    expect(report.issues.some((i) => i.code === 'SPAWN_OUTSIDE_HARD_BOUNDS')).toBe(false);
    expect(report.issues.some((i) => i.code === 'RESTART_OUTSIDE_HARD_BOUNDS')).toBe(false);
  });

  it('authors three photography subjects and mission zones', () => {
    expect(location.photographySubjects).toHaveLength(3);
    expect(location.gameplaySpatial.zones.length).toBeGreaterThanOrEqual(3);
  });

  it('records provenance', () => {
    expect(location.provenanceRecordIds.length).toBeGreaterThan(0);
    expect(MEDITERRANEAN_PROVENANCE_RECORDS.length).toBeGreaterThan(0);
  });

  it('preserves gameplay geometry across quality tiers', () => {
    const a = getMediterraneanExpeditionRegionLocation();
    const b = createMediterraneanExpeditionRegionLocation();
    expect(a.gameplaySpatial).toEqual(b.gameplaySpatial);
    expect(a.photographySubjects).toEqual(b.photographySubjects);
    expect(a.supportedQualityTiers).toEqual(['low', 'medium', 'high']);
  });

  it('uses a fixed authored seed for Coastal Ruins proxy layout', () => {
    expect(COASTAL_RUINS_AUTHORED_SEED).toBe(0x4d455249);
  });

  it('builds explicit collision descriptors separate from visuals', () => {
    const descriptors = buildCoastalRuinsCollisionDescriptors();
    expect(descriptors.length).toBeGreaterThanOrEqual(18);
    expect(descriptors.some((d) => d.category === 'terrain')).toBe(true);
    expect(descriptors.some((d) => d.id.includes('arch'))).toBe(true);
  });
});

describe('Coastal Ruins Survey mission', () => {
  const location = createMediterraneanExpeditionRegionLocation();
  const mission = createCoastalRuinsSurveyMission();

  it('validates with three sequential photography objectives', () => {
    const report = validateMissionDefinition(mission, {
      location,
      photographyObjectives: [...COASTAL_RUINS_PHOTO_OBJECTIVES],
      scoringPolicies: [COASTAL_RUINS_SCORING_POLICY],
    });
    expect(report.ok).toBe(true);
    expect(mission.missionId as unknown as string).toBe(MISSION_ID_COASTAL_RUINS_SURVEY);
    expect(mission.objectives).toHaveLength(3);
    expect(mission.grouping.mode).toBe('sequential');
    expect(mission.timePolicy.hardLimitTicks).toBeNull();
    expect(mission.timePolicy.timeBonus).toBeDefined();
    expect(mission.failurePolicy.crash.enabled).toBe(true);
  });

  it('has no endurance requirement and supports cinewhoop/hybrid', () => {
    const policy = mission.aircraftCompatibilityPolicy as Record<string, unknown>;
    expect(policy['enduranceMinutesMin']).toBeUndefined();
    expect(mission.aircraftCompatibilityPolicy.recommendedCategories).toContain(
      'protected-cinewhoop',
    );
    const compatible = evaluateMissionAircraftCompatibility({
      aircraftId: 'aeroguard-2',
      sourceType: 'factory',
      category: 'protected-cinewhoop',
      widthMeters: 0.25,
      heightMeters: 0.12,
      takeoffMassKg: 0.55,
      thrustToWeight: 4,
      recommendedMaxSpeedMps: 20,
      hasCamera: true,
      collisionProfileAvailable: true,
      collisionProvenance: 'runtime',
      runtimeCompatibilityVersion: '1.0.0',
    }, mission.aircraftCompatibilityPolicy);
    expect(compatible.status).toBe('compatible');
  });

  it('rejects oversized long-range aircraft', () => {
    const result = evaluateMissionAircraftCompatibility({
      aircraftId: 'horizon-l7',
      sourceType: 'factory',
      category: 'long-range-7inch',
      widthMeters: 0.7,
      heightMeters: 0.2,
      takeoffMassKg: 1.5,
      thrustToWeight: 3,
      recommendedMaxSpeedMps: 30,
      hasCamera: true,
      collisionProfileAvailable: true,
      runtimeCompatibilityVersion: '1.0.0',
    }, mission.aircraftCompatibilityPolicy);
    expect(result.status).toBe('incompatible');
  });

  it('warns for template-derived compiled aircraft camera/collision', () => {
    const result = evaluateMissionAircraftCompatibility({
      aircraftId: 'user-build-1',
      sourceType: 'user-compiled',
      category: 'hybrid-fpv',
      widthMeters: 0.3,
      heightMeters: 0.12,
      takeoffMassKg: 0.6,
      thrustToWeight: 4,
      recommendedMaxSpeedMps: 25,
      hasCamera: true,
      cameraProfileCapability: {
        minFovDeg: 80,
        maxFovDeg: 120,
        provenance: 'template-derived',
      },
      collisionProfileAvailable: true,
      collisionProvenance: 'template-derived',
      runtimeCompatibilityVersion: '1.0.0',
    }, mission.aircraftCompatibilityPolicy);
    expect(result.status).toBe('compatibleWithWarnings');
  });
});
