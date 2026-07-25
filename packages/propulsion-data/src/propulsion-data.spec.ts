import { describe, expect, it } from 'vitest';
import {
  A,
  N,
  V,
  W,
  asComponentRevisionId,
} from '@fpv/engineering-kernel';
import {
  PROPULSION_DATASET_SCHEMA_VERSION,
  asPropulsionDatasetFingerprint,
  asPropulsionDatasetId,
  asPropulsionDatasetRevisionId,
  buildSyntheticCuratedDataset,
  createMemoryPropulsionCalibrationRepository,
  createMemoryPropulsionDatasetRepository,
  defaultPropulsionDatasetCatalog,
  FACTORY_FIXTURE_CALIBRATIONS,
  fingerprintPropulsionDataset,
  FREE_FLIGHT_DATASET_POLICY,
  interpolatePropulsionOperatingPoint,
  matchPropulsionDataset,
  RANKED_DATASET_POLICY,
  validatePropulsionDataset,
  type PropulsionOperatingPoint,
  type PropulsionPerformanceDatasetRevision,
} from '@fpv/propulsion-data';

function basePoints(
  overrides: Partial<PropulsionOperatingPoint>[] = [],
): PropulsionOperatingPoint[] {
  const defaults: PropulsionOperatingPoint[] = [
    {
      pointId: 'p0',
      normalizedDriveCommand: 0,
      rpm: 0,
      voltageV: V(22.2),
      currentA: A(0),
      electricalPowerW: W(0),
      staticThrustN: N(0),
      torqueNm: null,
      efficiency: null,
      motorTemperatureK: null,
    },
    {
      pointId: 'p1',
      normalizedDriveCommand: 0.5,
      rpm: 20000,
      voltageV: V(22.2),
      currentA: A(20),
      electricalPowerW: W(444),
      staticThrustN: N(4),
      torqueNm: null,
      efficiency: 4 / 444,
      motorTemperatureK: null,
    },
    {
      pointId: 'p2',
      normalizedDriveCommand: 1,
      rpm: 40000,
      voltageV: V(22.2),
      currentA: A(40),
      electricalPowerW: W(888),
      staticThrustN: N(8),
      torqueNm: null,
      efficiency: 8 / 888,
      motorTemperatureK: null,
    },
  ];
  return defaults.map((p, i) => ({ ...p, ...(overrides[i] ?? {}) }));
}

function draftDataset(
  partial: Partial<Omit<PropulsionPerformanceDatasetRevision, 'fingerprint'>> & {
    operatingPoints?: readonly PropulsionOperatingPoint[];
  } = {},
): PropulsionPerformanceDatasetRevision {
  const draft: Omit<PropulsionPerformanceDatasetRevision, 'fingerprint'> = {
    datasetId: asPropulsionDatasetId('ds-test'),
    revisionId: asPropulsionDatasetRevisionId('ds-test@1'),
    parentRevisionId: null,
    schemaVersion: PROPULSION_DATASET_SCHEMA_VERSION,
    status: 'published',
    motorRevisionId: asComponentRevisionId('motor-2306-2750kv@1'),
    propellerRevisionId: asComponentRevisionId('prop-5x4x3@1'),
    cellCount: 6,
    testVoltageV: V(22.2),
    fullyChargedVoltageV: V(25.2),
    drive: {
      escRevisionId: null,
      protocol: null,
      timingAdvanceDeg: null,
      notes: null,
    },
    environment: {
      airDensityKgPerM3: 1.225,
      ambientTemperatureK: 293.15,
      altitudeMeters: 0,
      referenceLabel: null,
    },
    source: {
      category: 'curated-estimate',
      sourceName: 'test',
      citationId: null,
      measurementDateIso: null,
      testEquipment: null,
      testMethod: null,
      sampleCount: null,
      curator: 'test',
      licenseOrUsage: null,
      notes: 'presentation only',
      knownLimitations: [],
    },
    confidence: {
      level: 'medium',
      rationale: 'test',
      competitiveEligible: false,
    },
    operatingPoints: partial.operatingPoints ?? basePoints(),
    publishedAtIso: null,
    modelVersion: '1.1.2-test',
    ...partial,
  };
  // Ensure operatingPoints from partial win after spread
  const withPoints = {
    ...draft,
    operatingPoints: partial.operatingPoints ?? draft.operatingPoints,
  };
  return { ...withPoints, fingerprint: fingerprintPropulsionDataset(withPoints) };
}

describe('propulsion dataset validation', () => {
  it('rejects empty operating points', () => {
    const ds = draftDataset({ operatingPoints: [] });
    const result = validatePropulsionDataset(ds);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'DATASET_EMPTY_POINTS')).toBe(true);
  });

  it('rejects duplicate point ids', () => {
    const points = basePoints();
    const dup = [...points, { ...points[2], pointId: 'p0' }];
    const result = validatePropulsionDataset(draftDataset({ operatingPoints: dup }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'DATASET_DUPLICATE_POINT_ID')).toBe(
      true,
    );
  });

  it('rejects NaN and infinite values', () => {
    const points = basePoints([{ staticThrustN: Number.NaN as never }]);
    const draft = {
      datasetId: asPropulsionDatasetId('ds-test'),
      revisionId: asPropulsionDatasetRevisionId('ds-nan@1'),
      parentRevisionId: null,
      schemaVersion: PROPULSION_DATASET_SCHEMA_VERSION,
      status: 'published' as const,
      motorRevisionId: asComponentRevisionId('motor-2306-2750kv@1'),
      propellerRevisionId: asComponentRevisionId('prop-5x4x3@1'),
      cellCount: 6,
      testVoltageV: V(22.2),
      fullyChargedVoltageV: V(25.2),
      drive: {
        escRevisionId: null,
        protocol: null,
        timingAdvanceDeg: null,
        notes: null,
      },
      environment: {
        airDensityKgPerM3: 1.225,
        ambientTemperatureK: 293.15,
        altitudeMeters: 0,
        referenceLabel: null,
      },
      source: {
        category: 'curated-estimate' as const,
        sourceName: 'test',
        citationId: null,
        measurementDateIso: null,
        testEquipment: null,
        testMethod: null,
        sampleCount: null,
        curator: 'test',
        licenseOrUsage: null,
        notes: null,
        knownLimitations: [] as string[],
      },
      confidence: {
        level: 'medium' as const,
        rationale: 'test',
        competitiveEligible: false,
      },
      operatingPoints: points,
      publishedAtIso: null,
      modelVersion: '1.1.2-test',
      fingerprint: asPropulsionDatasetFingerprint('invalid-pending-validation'),
    };
    const result = validatePropulsionDataset(draft);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'DATASET_NON_FINITE')).toBe(true);
  });

  it('rejects negative physical values', () => {
    const points = basePoints([{}, { currentA: A(-1) }]);
    const result = validatePropulsionDataset(draftDataset({ operatingPoints: points }));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'DATASET_NEGATIVE_VALUE')).toBe(true);
  });

  it('warns on power inconsistency', () => {
    const points = basePoints([
      {},
      { electricalPowerW: W(10) }, // far from 22.2*20
    ]);
    const result = validatePropulsionDataset(draftDataset({ operatingPoints: points }));
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.code === 'DATASET_POWER_INCONSISTENT')).toBe(
      true,
    );
  });

  it('rejects unsupported schema version', () => {
    const result = validatePropulsionDataset(
      draftDataset({ schemaVersion: '9.9.9' }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'DATASET_UNSUPPORTED_SCHEMA')).toBe(
      true,
    );
  });

  it('rejects contradictory duplicate operating points', () => {
    const points = [
      ...basePoints(),
      {
        ...basePoints()[1],
        pointId: 'p1b',
        staticThrustN: N(9),
      },
    ];
    const result = validatePropulsionDataset(draftDataset({ operatingPoints: points }));
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'DATASET_CONTRADICTORY_COMMAND'),
    ).toBe(true);
  });

  it('normalizes ordering deterministically', () => {
    const shuffled = [basePoints()[2], basePoints()[0], basePoints()[1]];
    const result = validatePropulsionDataset(
      draftDataset({ operatingPoints: shuffled }),
    );
    expect(result.ok).toBe(true);
    expect(result.normalizedPoints!.map((p) => p.pointId)).toEqual([
      'p0',
      'p1',
      'p2',
    ]);
  });
});

describe('propulsion dataset matching', () => {
  const catalog = defaultPropulsionDatasetCatalog();

  it('matches exact motor/prop/voltage', () => {
    const result = matchPropulsionDataset(catalog, {
      motorRevisionId: 'motor-2306-2750kv@1',
      propellerRevisionId: 'prop-5x4x3@1',
      batteryNominalVoltageV: 22.2,
      escRevisionId: null,
      airDensityKgPerM3: 1.225,
      policy: FREE_FLIGHT_DATASET_POLICY,
    });
    expect(result.selected?.revisionId).toBe('ds-apex-r5-2306-5x4x3@1');
    expect(result.matchQuality).toBe('curated-estimate');
  });

  it('rejects wrong motor', () => {
    const result = matchPropulsionDataset(catalog, {
      motorRevisionId: 'motor-1103-10000kv@1',
      propellerRevisionId: 'prop-5x4x3@1',
      batteryNominalVoltageV: 22.2,
      escRevisionId: null,
      airDensityKgPerM3: null,
      policy: FREE_FLIGHT_DATASET_POLICY,
    });
    expect(result.selected).toBeNull();
    expect(result.matchQuality).toBe('legacy-peak-thrust-hint');
  });

  it('rejects wrong propeller', () => {
    const result = matchPropulsionDataset(catalog, {
      motorRevisionId: 'motor-2306-2750kv@1',
      propellerRevisionId: 'prop-7x4x3@1',
      batteryNominalVoltageV: 22.2,
      escRevisionId: null,
      airDensityKgPerM3: null,
      policy: FREE_FLIGHT_DATASET_POLICY,
    });
    expect(result.selected).toBeNull();
  });

  it('rejects unsupported voltage when interpolation disabled', () => {
    const result = matchPropulsionDataset(catalog, {
      motorRevisionId: 'motor-2306-2750kv@1',
      propellerRevisionId: 'prop-5x4x3@1',
      batteryNominalVoltageV: 14.8,
      escRevisionId: null,
      airDensityKgPerM3: null,
      policy: FREE_FLIGHT_DATASET_POLICY,
    });
    expect(result.selected).toBeNull();
  });

  it('rejects policy-disallowed provenance', () => {
    const strict = {
      ...RANKED_DATASET_POLICY,
      allowedProvenanceCategories: [
        'independent-bench-measurement' as const,
      ],
      legacyPeakThrustHintAllowed: false,
    };
    const result = matchPropulsionDataset(catalog, {
      motorRevisionId: 'motor-2306-2750kv@1',
      propellerRevisionId: 'prop-5x4x3@1',
      batteryNominalVoltageV: 22.2,
      escRevisionId: null,
      airDensityKgPerM3: null,
      policy: strict,
    });
    expect(result.selected).toBeNull();
  });

  it('rejects low-confidence under strict minConfidence', () => {
    const low = draftDataset({
      confidence: {
        level: 'low',
        rationale: 'low',
        competitiveEligible: false,
      },
    });
    const result = matchPropulsionDataset([low], {
      motorRevisionId: 'motor-2306-2750kv@1',
      propellerRevisionId: 'prop-5x4x3@1',
      batteryNominalVoltageV: 22.2,
      escRevisionId: null,
      airDensityKgPerM3: null,
      policy: RANKED_DATASET_POLICY,
    });
    expect(result.selected).toBeNull();
  });

  it('dataset ordering does not affect selection', () => {
    const a = matchPropulsionDataset(catalog, {
      motorRevisionId: 'motor-2306-2750kv@1',
      propellerRevisionId: 'prop-5x4x3@1',
      batteryNominalVoltageV: 22.2,
      escRevisionId: null,
      airDensityKgPerM3: null,
      policy: FREE_FLIGHT_DATASET_POLICY,
    });
    const b = matchPropulsionDataset([...catalog].reverse(), {
      motorRevisionId: 'motor-2306-2750kv@1',
      propellerRevisionId: 'prop-5x4x3@1',
      batteryNominalVoltageV: 22.2,
      escRevisionId: null,
      airDensityKgPerM3: null,
      policy: FREE_FLIGHT_DATASET_POLICY,
    });
    expect(a.selected?.revisionId).toBe(b.selected?.revisionId);
    expect(a.selected?.fingerprint).toBe(b.selected?.fingerprint);
  });

  it('unused dataset injection does not change selection', () => {
    const unrelated = buildSyntheticCuratedDataset({
      datasetId: 'ds-unrelated',
      revisionId: 'ds-unrelated@1',
      motorRevisionId: 'motor-1103-10000kv@1',
      propellerRevisionId: 'prop-65mm-2blade@1',
      testVoltageV: 3.7,
      cellCount: 1,
      maxThrustN: 0.5,
      maxCurrentA: 5,
      maxRpm: 50000,
      thrustExponent: 1,
      curator: 'test',
      label: 'unrelated',
    });
    const base = matchPropulsionDataset(catalog, {
      motorRevisionId: 'motor-2306-2750kv@1',
      propellerRevisionId: 'prop-5x4x3@1',
      batteryNominalVoltageV: 22.2,
      escRevisionId: null,
      airDensityKgPerM3: null,
      policy: FREE_FLIGHT_DATASET_POLICY,
    });
    const withExtra = matchPropulsionDataset([...catalog, unrelated], {
      motorRevisionId: 'motor-2306-2750kv@1',
      propellerRevisionId: 'prop-5x4x3@1',
      batteryNominalVoltageV: 22.2,
      escRevisionId: null,
      airDensityKgPerM3: null,
      policy: FREE_FLIGHT_DATASET_POLICY,
    });
    expect(withExtra.selected?.fingerprint).toBe(base.selected?.fingerprint);
  });

  it('ambiguous equal-rank match breaks ties by revisionId', () => {
    const a = draftDataset({
      revisionId: asPropulsionDatasetRevisionId('ds-tie-b@1'),
      datasetId: asPropulsionDatasetId('ds-tie-b'),
    });
    const b = draftDataset({
      revisionId: asPropulsionDatasetRevisionId('ds-tie-a@1'),
      datasetId: asPropulsionDatasetId('ds-tie-a'),
    });
    // Force distinct fingerprints via different notes-excluded? Use different knownLimitations
    const a2 = draftDataset({
      revisionId: asPropulsionDatasetRevisionId('ds-tie-b@1'),
      datasetId: asPropulsionDatasetId('ds-tie-b'),
      source: {
        ...a.source,
        knownLimitations: ['x'],
      },
    });
    const b2 = draftDataset({
      revisionId: asPropulsionDatasetRevisionId('ds-tie-a@1'),
      datasetId: asPropulsionDatasetId('ds-tie-a'),
      source: {
        ...b.source,
        knownLimitations: ['y'],
      },
    });
    const result = matchPropulsionDataset([a2, b2], {
      motorRevisionId: 'motor-2306-2750kv@1',
      propellerRevisionId: 'prop-5x4x3@1',
      batteryNominalVoltageV: 22.2,
      escRevisionId: null,
      airDensityKgPerM3: null,
      policy: FREE_FLIGHT_DATASET_POLICY,
    });
    expect(result.selected?.revisionId).toBe('ds-tie-a@1');
    expect(result.warnings).toContain(
      'PROP_MATCH_AMBIGUOUS_TIE_BROKEN_BY_REVISION_ID',
    );
  });
});

describe('propulsion interpolation', () => {
  const points = basePoints();

  it('exact-point lookup', () => {
    const r = interpolatePropulsionOperatingPoint(points, {
      axis: 'normalizedDriveCommand',
      value: 0.5,
    });
    expect(r.thrustN).toBe(4);
    expect(r.extrapolated).toBe(false);
  });

  it('midpoint interpolation', () => {
    const r = interpolatePropulsionOperatingPoint(points, {
      axis: 'normalizedDriveCommand',
      value: 0.25,
    });
    expect(r.thrustN).toBe(2);
    expect(r.currentA).toBe(10);
  });

  it('clamps outside envelope by default', () => {
    const r = interpolatePropulsionOperatingPoint(points, {
      axis: 'normalizedDriveCommand',
      value: 1.5,
    });
    expect(r.clamped).toBe(true);
    expect(r.extrapolated).toBe(false);
    expect(r.thrustN).toBe(8);
    expect(r.warnings).toContain('PROP_INTERP_CLAMPED_TO_ENVELOPE');
  });

  it('does not extrapolate by default', () => {
    const r = interpolatePropulsionOperatingPoint(points, {
      axis: 'normalizedDriveCommand',
      value: -0.2,
      allowExtrapolation: false,
    });
    expect(r.extrapolated).toBe(false);
    expect(r.clamped).toBe(true);
  });

  it('produces finite quantized outputs', () => {
    const r = interpolatePropulsionOperatingPoint(points, {
      axis: 'normalizedDriveCommand',
      value: 1 / 3,
    });
    expect(Number.isFinite(r.thrustN)).toBe(true);
    expect(Number.isFinite(r.powerW!)).toBe(true);
    expect(r.rpm).not.toBeNull();
  });
});

describe('propulsion fingerprints and persistence', () => {
  it('property ordering does not affect fingerprint', () => {
    const a = draftDataset();
    const b = draftDataset();
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('physics-affecting point change alters fingerprint', () => {
    const a = draftDataset();
    const b = draftDataset({
      operatingPoints: basePoints([{}, {}, { staticThrustN: N(9) }]),
    });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('presentation-only notes do not alter physical fingerprint', () => {
    const a = draftDataset();
    const b = draftDataset({
      source: {
        ...a.source,
        notes: 'completely different presentation text',
      },
    });
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('memory repository enforces immutability', async () => {
    const repo = createMemoryPropulsionDatasetRepository();
    const ds = draftDataset();
    await repo.insertDatasetRevision(ds);
    await repo.insertDatasetRevision(ds);
    const mutated = draftDataset({
      operatingPoints: basePoints([{}, {}, { staticThrustN: N(99) }]),
    });
    await expect(repo.insertDatasetRevision(mutated)).rejects.toThrow(
      /IMMUTABLE|overwrite/i,
    );
  });

  it('calibration repository inserts identity profile', async () => {
    const repo = createMemoryPropulsionCalibrationRepository();
    const cal = FACTORY_FIXTURE_CALIBRATIONS[0];
    await repo.insertCalibrationRevision(cal);
    expect(await repo.getCalibrationRevision(cal.revisionId)).toEqual(cal);
  });
});
