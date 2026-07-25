import type { ResolvedAssembly, UserTuningValues } from '@fpv/drone-build-domain';
import type { ElectricalSystemResult } from '../electrical/solver';
import {
  defaultPropulsionDatasetCatalog,
  FREE_FLIGHT_DATASET_POLICY,
  interpolatePropulsionOperatingPoint,
  legacyVoltageFactor,
  matchPropulsionDataset,
  type PropulsionCalibrationProfileRevision,
  type PropulsionDataSourceMode,
  type PropulsionDatasetEligibilityPolicy,
  type PropulsionMatchQuality,
  type PropulsionPerformanceDatasetRevision,
} from '@fpv/propulsion-data';

export interface ThrustSample {
  readonly throttle: number;
  readonly thrustNewtons: number;
  readonly currentA: number;
  readonly rpm: number;
}

export type PropulsionDataProvenance =
  | 'measured-table'
  | 'curated-estimate-table'
  | 'peak-thrust-hint-fallback'
  | 'estimated';

export interface PropulsionUnitSourceMetadata {
  readonly dataSourceMode: PropulsionDataSourceMode;
  readonly datasetRevisionId: string | null;
  readonly datasetFingerprint: string | null;
  readonly matchQuality: PropulsionMatchQuality;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly fallbackReason: string | null;
  readonly warnings: readonly string[];
  readonly maximumTestedThrustN: number;
  readonly estimatedOperatingThrustN: number;
  readonly electricalDemandA: number | null;
  readonly rpmMin: number | null;
  readonly rpmMax: number | null;
  readonly calibrationRevisionId: string | null;
  readonly calibrationFingerprint: string | null;
  readonly modelVersion: string;
}

export interface PropulsionUnitResult {
  readonly selectionId: string;
  readonly motorSelectionId: string;
  readonly propellerSelectionId: string;
  readonly maxThrustNewtons: number;
  readonly maxTransientThrustNewtons: number;
  readonly responseTimeS: number;
  readonly spoolUpTimeS: number;
  readonly spoolDownTimeS: number;
  readonly position: { x: number; y: number; z: number };
  readonly rotation: 'cw' | 'ccw';
  readonly thrustCurve: readonly ThrustSample[];
  readonly dataProvenance: PropulsionDataProvenance;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly fallbackPath: string | null;
  readonly modelVersion: string;
  readonly source: PropulsionUnitSourceMetadata;
}

export interface PropulsionSystemResult {
  readonly units: readonly PropulsionUnitResult[];
  readonly totalMaxThrustNewtons: number;
  readonly thrustToWeight: number;
  readonly hoverThrottleEstimate: number;
  readonly modelVersion: string;
  readonly dataProvenance: PropulsionDataProvenance;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly warnings: readonly string[];
}

export interface PropulsionSolveOptions {
  readonly datasets?: readonly PropulsionPerformanceDatasetRevision[];
  readonly datasetPolicy?: PropulsionDatasetEligibilityPolicy;
  readonly calibrationsByDatasetRevisionId?: ReadonlyMap<
    string,
    PropulsionCalibrationProfileRevision
  >;
}

function buildHintThrustCurve(
  maxThrust: number,
  maxCurrent: number,
  maxRpm: number,
  exponent: number,
): ThrustSample[] {
  const samples: ThrustSample[] = [];
  for (let i = 0; i <= 10; i++) {
    const throttle = i / 10;
    samples.push({
      throttle,
      thrustNewtons: maxThrust * Math.pow(throttle, exponent),
      currentA: maxCurrent * Math.pow(throttle, 1.3),
      rpm: maxRpm * throttle,
    });
  }
  return samples;
}

function buildDatasetThrustCurve(
  dataset: PropulsionPerformanceDatasetRevision,
  thrustScale: number,
  currentScale: number,
  rpmScale: number,
): ThrustSample[] {
  const samples: ThrustSample[] = [];
  for (let i = 0; i <= 10; i++) {
    const throttle = i / 10;
    const interp = interpolatePropulsionOperatingPoint(dataset.operatingPoints, {
      axis: 'normalizedDriveCommand',
      value: throttle,
      allowExtrapolation: false,
      clampToEnvelope: true,
    });
    samples.push({
      throttle,
      thrustNewtons: interp.thrustN * thrustScale,
      currentA: (interp.currentA ?? 0) * currentScale,
      rpm: (interp.rpm ?? 0) * rpmScale,
    });
  }
  return samples;
}

function mapConfidence(
  level: string,
): 'high' | 'medium' | 'low' {
  if (level === 'high') return 'high';
  if (level === 'medium') return 'medium';
  return 'low';
}

function applyCalibrationScales(
  calibration: PropulsionCalibrationProfileRevision | null,
): {
  thrustScale: number;
  currentScale: number;
  rpmScale: number;
  responseScale: number;
  spoolScale: number;
} {
  if (!calibration) {
    return {
      thrustScale: 1,
      currentScale: 1,
      rpmScale: 1,
      responseScale: 1,
      spoolScale: 1,
    };
  }
  const c = calibration.corrections;
  const bench = c.benchToFlightThrustScale ?? 1;
  return {
    thrustScale: c.thrustScale * bench,
    currentScale: c.currentScale,
    rpmScale: c.rpmScale,
    responseScale: c.motorResponseTimeScale,
    spoolScale: c.propellerSpoolScale,
  };
}

/**
 * Topology-driven propulsion solver.
 * Consumes ResolvedPropulsionUnit relationships — never pairs by array index.
 *
 * Resolves each unit through the propulsion dataset system first.
 * Legacy peakThrustHintNewtons remains only as an explicit Free-Flight-capable
 * fallback when no compatible dataset matches.
 */
export function solvePropulsion(
  assembly: ResolvedAssembly,
  electrical: ElectricalSystemResult,
  totalMassKg: number,
  tuning: UserTuningValues,
  options: PropulsionSolveOptions = {},
): PropulsionSystemResult {
  const datasets = options.datasets ?? defaultPropulsionDatasetCatalog();
  const datasetPolicy = options.datasetPolicy ?? FREE_FLIGHT_DATASET_POLICY;
  const calibrations = options.calibrationsByDatasetRevisionId;

  const units: PropulsionUnitResult[] = [];
  let totalThrust = 0;
  const warnings: string[] = [];
  let systemProvenance: PropulsionDataProvenance = 'measured-table';
  let systemConfidence: 'high' | 'medium' | 'low' = 'high';

  for (const pu of assembly.propulsionUnits) {
    const motor = pu.motorComponent;
    const prop = pu.propellerComponent;
    if (motor.engineering.type !== 'motor') continue;

    const propCt =
      prop.engineering.type === 'propeller'
        ? prop.engineering.propeller.thrustCoefficient
        : 0.1;
    const maxRpmHint =
      prop.engineering.type === 'propeller'
        ? prop.engineering.propeller.recommendedRpmMax
        : 40000;
    const responseBase = motor.engineering.motor.responseTimeConstantS;

    const match = matchPropulsionDataset(datasets, {
      motorRevisionId: motor.revisionId,
      propellerRevisionId: prop.revisionId,
      batteryNominalVoltageV: electrical.nominalVoltage,
      escRevisionId: pu.electricalPath.escSelectionId
        ? (assembly.componentBySelectionId.get(pu.electricalPath.escSelectionId)
            ?.revisionId ?? null)
        : null,
      airDensityKgPerM3: 1.225,
      policy: datasetPolicy,
    });

    warnings.push(...match.warnings);

    if (match.selected) {
      const calibration =
        calibrations?.get(match.selected.revisionId) ?? null;
      const scales = applyCalibrationScales(calibration);
      const points = match.selected.operatingPoints;
      const maxPoint = points.reduce((best, p) =>
        p.staticThrustN > best.staticThrustN ? p : best,
      );
      const peakInterp = interpolatePropulsionOperatingPoint(points, {
        axis: 'normalizedDriveCommand',
        value: 1,
        allowExtrapolation: false,
        clampToEnvelope: true,
      });
      const maxThrust = peakInterp.thrustN * scales.thrustScale;
      const transient = maxThrust * 1.08;
      const curve = buildDatasetThrustCurve(
        match.selected,
        scales.thrustScale,
        scales.currentScale,
        scales.rpmScale,
      );
      const rpmValues = points
        .map((p) => p.rpm)
        .filter((r): r is number => r !== null && Number.isFinite(r));
      const dataProvenance: PropulsionDataProvenance =
        match.matchQuality === 'curated-estimate'
          ? 'curated-estimate-table'
          : 'measured-table';
      const confidence = mapConfidence(match.confidence);
      const response = responseBase * scales.responseScale;
      const unitWarnings = [
        ...match.warnings,
        ...peakInterp.warnings,
        ...(calibration
          ? [`PROP_CALIBRATION_APPLIED:${calibration.revisionId}`]
          : []),
      ];

      units.push({
        selectionId: pu.propellerSelection.selectionId,
        motorSelectionId: pu.motorSelection.selectionId,
        propellerSelectionId: pu.propellerSelection.selectionId,
        maxThrustNewtons: maxThrust,
        maxTransientThrustNewtons: transient,
        responseTimeS: response,
        spoolUpTimeS: response * 1.2 * scales.spoolScale,
        spoolDownTimeS: response * 1.6 * scales.spoolScale,
        position: { ...pu.position },
        rotation: pu.rotationDirection,
        thrustCurve: curve,
        dataProvenance,
        confidence,
        fallbackPath: null,
        modelVersion: '1.1.2-dataset',
        source: {
          dataSourceMode:
            dataProvenance === 'measured-table'
              ? 'measured-table'
              : 'curated-estimate-table',
          datasetRevisionId: match.selected.revisionId,
          datasetFingerprint: match.selected.fingerprint,
          matchQuality: match.matchQuality,
          confidence,
          fallbackReason: null,
          warnings: unitWarnings,
          maximumTestedThrustN: maxPoint.staticThrustN * scales.thrustScale,
          estimatedOperatingThrustN: maxThrust,
          electricalDemandA:
            peakInterp.currentA === null
              ? null
              : peakInterp.currentA * scales.currentScale,
          rpmMin: rpmValues.length ? Math.min(...rpmValues) * scales.rpmScale : null,
          rpmMax: rpmValues.length ? Math.max(...rpmValues) * scales.rpmScale : null,
          calibrationRevisionId: calibration?.revisionId ?? null,
          calibrationFingerprint: calibration?.fingerprint ?? null,
          modelVersion: '1.1.2-dataset',
        },
      });
      totalThrust += maxThrust;

      if (confidence === 'low') systemConfidence = 'low';
      else if (confidence === 'medium' && systemConfidence === 'high') {
        systemConfidence = 'medium';
      }
      if (
        systemProvenance === 'measured-table' &&
        dataProvenance !== 'measured-table'
      ) {
        systemProvenance = dataProvenance;
      }
      continue;
    }

    // Explicit legacy fallback
    if (!datasetPolicy.legacyPeakThrustHintAllowed) {
      warnings.push('PROP_FALLBACK_REJECTED_BY_POLICY');
      systemConfidence = 'low';
      systemProvenance = 'peak-thrust-hint-fallback';
      continue;
    }

    const voltageFactor = legacyVoltageFactor(electrical.nominalVoltage);
    const maxThrust =
      motor.engineering.motor.peakThrustHintNewtons *
      (0.85 + propCt) *
      voltageFactor;
    const transient = maxThrust * 1.08;
    const curve = buildHintThrustCurve(
      maxThrust,
      motor.engineering.motor.maxContinuousCurrentA,
      maxRpmHint,
      tuning.thrustCurveExponent,
    );
    const fallbackWarning =
      'PROP_LEGACY_PEAK_THRUST_HINT_FALLBACK — not measured performance tables';
    warnings.push(fallbackWarning);

    units.push({
      selectionId: pu.propellerSelection.selectionId,
      motorSelectionId: pu.motorSelection.selectionId,
      propellerSelectionId: pu.propellerSelection.selectionId,
      maxThrustNewtons: maxThrust,
      maxTransientThrustNewtons: transient,
      responseTimeS: responseBase,
      spoolUpTimeS: responseBase * 1.2,
      spoolDownTimeS: responseBase * 1.6,
      position: { ...pu.position },
      rotation: pu.rotationDirection,
      thrustCurve: curve,
      dataProvenance: 'peak-thrust-hint-fallback',
      confidence: 'low',
      fallbackPath:
        'motor.peakThrustHintNewtons * (0.85 + propCt) * legacyVoltageFactor(nominalV)',
      modelVersion: '1.1.2-hint-fallback',
      source: {
        dataSourceMode: 'peak-thrust-hint-fallback',
        datasetRevisionId: null,
        datasetFingerprint: null,
        matchQuality: 'legacy-peak-thrust-hint',
        confidence: 'low',
        fallbackReason: match.fallbackReason ?? 'no-compatible-dataset',
        warnings: [fallbackWarning, ...match.warnings],
        maximumTestedThrustN: maxThrust,
        estimatedOperatingThrustN: maxThrust,
        electricalDemandA: null,
        rpmMin: null,
        rpmMax: null,
        calibrationRevisionId: null,
        calibrationFingerprint: null,
        modelVersion: '1.1.2-hint-fallback',
      },
    });
    totalThrust += maxThrust;
    systemProvenance = 'peak-thrust-hint-fallback';
    systemConfidence = 'low';
  }

  const weightN = totalMassKg * 9.81;
  const twr = weightN > 0 ? totalThrust / weightN : 0;
  const hoverThrottle =
    totalThrust > 0
      ? Math.min(
          0.95,
          Math.pow(
            weightN / totalThrust,
            1 / Math.max(0.5, tuning.thrustCurveExponent),
          ),
        )
      : 1;

  const uniqueWarnings = [...new Set(warnings)];

  return {
    units,
    totalMaxThrustNewtons: totalThrust,
    thrustToWeight: twr,
    hoverThrottleEstimate: hoverThrottle,
    modelVersion: '1.1.2-dataset-aware',
    dataProvenance: systemProvenance,
    confidence: systemConfidence,
    warnings: uniqueWarnings,
  };
}
