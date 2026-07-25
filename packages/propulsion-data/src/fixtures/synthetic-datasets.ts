import {
  asComponentRevisionId,
  V,
  A,
  W,
  N,
  type ComponentRevisionId,
  type Volts,
} from '@fpv/engineering-kernel';
import {
  asPropulsionDatasetId,
  asPropulsionDatasetRevisionId,
} from '../domain/ids';
import {
  PROPULSION_DATASET_SCHEMA_VERSION,
  type PropulsionOperatingPoint,
  type PropulsionPerformanceDatasetRevision,
} from '../domain/models';
import { fingerprintPropulsionDataset } from '../fingerprinting/fingerprint';
import { validatePropulsionDataset } from '../validation/validate-dataset';

export interface SyntheticCurveSpec {
  readonly datasetId: string;
  readonly revisionId: string;
  readonly motorRevisionId: string;
  readonly propellerRevisionId: string;
  readonly testVoltageV: number;
  readonly cellCount: number;
  readonly maxThrustN: number;
  readonly maxCurrentA: number;
  readonly maxRpm: number;
  readonly thrustExponent: number;
  readonly escRevisionId?: string | null;
  readonly curator: string;
  readonly label: string;
}

function buildPoints(spec: SyntheticCurveSpec): PropulsionOperatingPoint[] {
  const points: PropulsionOperatingPoint[] = [];
  for (let i = 0; i <= 5; i++) {
    const command = i / 5;
    const thrust = spec.maxThrustN * Math.pow(command, spec.thrustExponent);
    const current = spec.maxCurrentA * Math.pow(command, 1.3);
    const rpm = spec.maxRpm * command;
    const power = spec.testVoltageV * current;
    points.push({
      pointId: `cmd-${i}`,
      normalizedDriveCommand: command,
      rpm,
      voltageV: V(spec.testVoltageV),
      currentA: A(current),
      electricalPowerW: W(power),
      staticThrustN: N(thrust),
      torqueNm: null,
      efficiency: command > 0 && power > 0 ? thrust / power : null,
      motorTemperatureK: null,
    });
  }
  return points;
}

/**
 * Build a published synthetic/curated dataset revision.
 * Explicitly labeled — never presented as measured bench data.
 */
export function buildSyntheticCuratedDataset(
  spec: SyntheticCurveSpec,
): PropulsionPerformanceDatasetRevision {
  const draft: Omit<PropulsionPerformanceDatasetRevision, 'fingerprint'> = {
    datasetId: asPropulsionDatasetId(spec.datasetId),
    revisionId: asPropulsionDatasetRevisionId(spec.revisionId),
    parentRevisionId: null,
    schemaVersion: PROPULSION_DATASET_SCHEMA_VERSION,
    status: 'published',
    motorRevisionId: asComponentRevisionId(spec.motorRevisionId),
    propellerRevisionId: asComponentRevisionId(spec.propellerRevisionId),
    cellCount: spec.cellCount,
    testVoltageV: V(spec.testVoltageV) as Volts,
    fullyChargedVoltageV: V(spec.testVoltageV * (4.2 / 3.7)),
    drive: {
      escRevisionId: spec.escRevisionId
        ? (asComponentRevisionId(spec.escRevisionId) as ComponentRevisionId)
        : null,
      protocol: 'DShot600',
      timingAdvanceDeg: null,
      notes: 'Synthetic fixture drive assumptions',
    },
    environment: {
      airDensityKgPerM3: 1.225,
      ambientTemperatureK: 293.15,
      altitudeMeters: 0,
      referenceLabel: 'ISA sea-level reference',
    },
    source: {
      category: 'curated-estimate',
      sourceName: spec.label,
      citationId: null,
      measurementDateIso: null,
      testEquipment: null,
      testMethod: 'synthetic-curve-from-legacy-hint-continuity',
      sampleCount: null,
      curator: spec.curator,
      licenseOrUsage: 'internal-engineering-fixture',
      notes:
        'Synthetic curated fixture for architecture/interpolation validation. NOT measured. NOT commercial calibration.',
      knownLimitations: [
        'synthetic-not-measured',
        'approximates-legacy-peak-thrust-hint-continuity',
        'no-commercial-physical-fidelity-claim',
      ],
    },
    confidence: {
      level: 'medium',
      rationale:
        'Curated synthetic table for pipeline validation; medium confidence, not competitive-measured.',
      competitiveEligible: false,
    },
    operatingPoints: buildPoints(spec),
    publishedAtIso: null,
    modelVersion: '1.1.2-synthetic-curated',
  };

  const fingerprint = fingerprintPropulsionDataset(draft);
  const revision: PropulsionPerformanceDatasetRevision = {
    ...draft,
    fingerprint,
  };
  const validation = validatePropulsionDataset(revision);
  if (!validation.ok) {
    throw new Error(
      `Synthetic dataset failed validation: ${validation.errors.map((e) => e.code).join(',')}`,
    );
  }
  return {
    ...revision,
    operatingPoints: validation.normalizedPoints!,
  };
}

/**
 * Factory calibration fixtures (at most two aircraft).
 *
 * Thrust peaks intentionally approximate the prior peakThrustHint path so
 * architecture can be proven without inventing measured manufacturer curves.
 * This is continuity of feel for fixtures — not a fidelity claim.
 *
 * apex-r5: 6.2 * (0.85+0.11) * (22.2/14.8) = 8.928 N / motor
 * velocity-x: 5.5 * (0.85+0.12) * (22.2/14.8) = 8.0025 N / motor
 */
export const FACTORY_FIXTURE_DATASETS: readonly PropulsionPerformanceDatasetRevision[] =
  [
    buildSyntheticCuratedDataset({
      datasetId: 'ds-apex-r5-2306-5x4x3',
      revisionId: 'ds-apex-r5-2306-5x4x3@1',
      motorRevisionId: 'motor-2306-2750kv@1',
      propellerRevisionId: 'prop-5x4x3@1',
      testVoltageV: 22.2,
      cellCount: 6,
      maxThrustN: 8.928,
      maxCurrentA: 45,
      maxRpm: 45000,
      thrustExponent: 1.0,
      escRevisionId: 'esc-4in1-45a@1',
      curator: 'fpv-trainer-engineering',
      label: 'Apex R5 synthetic curated fixture',
    }),
    buildSyntheticCuratedDataset({
      datasetId: 'ds-velocity-x-2207-6x4x3',
      revisionId: 'ds-velocity-x-2207-6x4x3@1',
      motorRevisionId: 'motor-2207-2450kv@1',
      propellerRevisionId: 'prop-6x4x3@1',
      testVoltageV: 22.2,
      cellCount: 6,
      maxThrustN: 8.0025,
      maxCurrentA: 40,
      maxRpm: 38000,
      thrustExponent: 1.05,
      escRevisionId: 'esc-4in1-45a@1',
      curator: 'fpv-trainer-engineering',
      label: 'Velocity X synthetic curated fixture',
    }),
  ];

export function defaultPropulsionDatasetCatalog(): readonly PropulsionPerformanceDatasetRevision[] {
  return FACTORY_FIXTURE_DATASETS;
}
