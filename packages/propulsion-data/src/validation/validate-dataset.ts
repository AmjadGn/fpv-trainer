import { PROPULSION_DATASET_SCHEMA_VERSION } from '../domain/models';
import type {
  PropulsionOperatingPoint,
  PropulsionPerformanceDatasetRevision,
  PropulsionDatasetValidationIssue,
  PropulsionDatasetValidationResult,
} from '../domain/models';

const POWER_TOLERANCE_RATIO = 0.08;
const RPM_DECREASE_WARN_RATIO = 0.15;
const THRUST_NEGATIVE_DELTA_WARN = 0.05;

function issue(
  code: string,
  severity: PropulsionDatasetValidationIssue['severity'],
  message: string,
  pointId: string | null = null,
  parameters: Record<string, string | number | boolean> = {},
): PropulsionDatasetValidationIssue {
  return { code, severity, message, pointId, parameters };
}

function isFiniteNumber(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function assertNonNegativeField(
  value: number | null,
  field: string,
  pointId: string,
  errors: PropulsionDatasetValidationIssue[],
): void {
  if (value === null) return;
  if (!Number.isFinite(value)) {
    errors.push(
      issue('DATASET_NON_FINITE', 'error', `${field} is not finite`, pointId, {
        field,
      }),
    );
    return;
  }
  if (value < 0) {
    errors.push(
      issue('DATASET_NEGATIVE_VALUE', 'error', `${field} must be >= 0`, pointId, {
        field,
        value,
      }),
    );
  }
}

/**
 * Strict validation before a dataset can be used.
 * Does not silently repair measured data.
 */
export function validatePropulsionDataset(
  dataset: PropulsionPerformanceDatasetRevision,
): PropulsionDatasetValidationResult {
  const errors: PropulsionDatasetValidationIssue[] = [];
  const warnings: PropulsionDatasetValidationIssue[] = [];
  const infos: PropulsionDatasetValidationIssue[] = [];

  if (!dataset.datasetId) {
    errors.push(issue('DATASET_MISSING_ID', 'error', 'datasetId is required'));
  }
  if (!dataset.revisionId) {
    errors.push(
      issue('DATASET_MISSING_REVISION_ID', 'error', 'revisionId is required'),
    );
  }
  if (dataset.schemaVersion !== PROPULSION_DATASET_SCHEMA_VERSION) {
    errors.push(
      issue(
        'DATASET_UNSUPPORTED_SCHEMA',
        'error',
        `Unsupported schema version ${dataset.schemaVersion}`,
        null,
        {
          schemaVersion: dataset.schemaVersion,
          supported: PROPULSION_DATASET_SCHEMA_VERSION,
        },
      ),
    );
  }
  if (!dataset.motorRevisionId || !dataset.propellerRevisionId) {
    errors.push(
      issue(
        'DATASET_MISSING_COMPONENT_REFS',
        'error',
        'motorRevisionId and propellerRevisionId are required',
      ),
    );
  }
  if (!Number.isFinite(dataset.testVoltageV) || dataset.testVoltageV <= 0) {
    errors.push(
      issue('DATASET_INVALID_TEST_VOLTAGE', 'error', 'testVoltageV must be > 0'),
    );
  }
  if (
    !Number.isFinite(dataset.environment.airDensityKgPerM3) ||
    dataset.environment.airDensityKgPerM3 <= 0
  ) {
    errors.push(
      issue(
        'DATASET_INVALID_AIR_DENSITY',
        'error',
        'airDensityKgPerM3 must be > 0',
      ),
    );
  }

  const points = dataset.operatingPoints;
  if (!points || points.length === 0) {
    errors.push(
      issue(
        'DATASET_EMPTY_POINTS',
        'error',
        'operatingPoints must be non-empty',
      ),
    );
    return { ok: false, errors, warnings, infos, normalizedPoints: null };
  }

  const seenIds = new Set<string>();
  const commandMap = new Map<number, PropulsionOperatingPoint>();

  for (const p of points) {
    if (!p.pointId) {
      errors.push(issue('DATASET_POINT_MISSING_ID', 'error', 'pointId required'));
      continue;
    }
    if (seenIds.has(p.pointId)) {
      errors.push(
        issue(
          'DATASET_DUPLICATE_POINT_ID',
          'error',
          `Duplicate pointId ${p.pointId}`,
          p.pointId,
        ),
      );
    }
    seenIds.add(p.pointId);

    if (
      !Number.isFinite(p.normalizedDriveCommand) ||
      p.normalizedDriveCommand < 0 ||
      p.normalizedDriveCommand > 1
    ) {
      errors.push(
        issue(
          'DATASET_INVALID_COMMAND',
          'error',
          'normalizedDriveCommand must be in [0, 1]',
          p.pointId,
          { command: p.normalizedDriveCommand },
        ),
      );
    }

    if (!Number.isFinite(p.staticThrustN)) {
      errors.push(
        issue('DATASET_NON_FINITE', 'error', 'staticThrustN is not finite', p.pointId),
      );
    } else if (p.staticThrustN < 0) {
      errors.push(
        issue('DATASET_NEGATIVE_VALUE', 'error', 'staticThrustN must be >= 0', p.pointId, {
          value: p.staticThrustN,
        }),
      );
    }

    assertNonNegativeField(p.rpm, 'rpm', p.pointId, errors);
    assertNonNegativeField(p.currentA, 'currentA', p.pointId, errors);
    assertNonNegativeField(p.electricalPowerW, 'electricalPowerW', p.pointId, errors);
    assertNonNegativeField(p.torqueNm, 'torqueNm', p.pointId, errors);
    assertNonNegativeField(p.efficiency, 'efficiency', p.pointId, errors);
    assertNonNegativeField(p.motorTemperatureK, 'motorTemperatureK', p.pointId, errors);

    if (!Number.isFinite(p.voltageV) || p.voltageV < 0) {
      errors.push(
        issue('DATASET_INVALID_POINT_VOLTAGE', 'error', 'voltageV must be >= 0', p.pointId),
      );
    }

    if (
      p.normalizedDriveCommand > 0 &&
      isFiniteNumber(p.currentA) &&
      p.currentA > 0 &&
      p.voltageV === 0
    ) {
      errors.push(
        issue(
          'DATASET_ZERO_VOLTAGE_POWERED',
          'error',
          'Powered point cannot have zero voltage',
          p.pointId,
        ),
      );
    }

    if (
      isFiniteNumber(p.currentA) &&
      isFiniteNumber(p.electricalPowerW) &&
      p.voltageV > 0
    ) {
      const expected = p.voltageV * p.currentA;
      const denom = Math.max(expected, 1e-9);
      const rel = Math.abs(p.electricalPowerW - expected) / denom;
      if (rel > POWER_TOLERANCE_RATIO) {
        warnings.push(
          issue(
            'DATASET_POWER_INCONSISTENT',
            'warning',
            'electricalPowerW inconsistent with V×I beyond tolerance',
            p.pointId,
            {
              relativeError: rel,
              tolerance: POWER_TOLERANCE_RATIO,
              expected,
              actual: p.electricalPowerW,
            },
          ),
        );
      }
    }

    if (isFiniteNumber(p.efficiency) && p.efficiency > 1.5) {
      warnings.push(
        issue(
          'DATASET_EFFICIENCY_SUSPICIOUS',
          'warning',
          'efficiency exceeds documented sanity bound',
          p.pointId,
          { efficiency: p.efficiency },
        ),
      );
    }

    const existing = commandMap.get(p.normalizedDriveCommand);
    if (existing) {
      const contradictory =
        existing.staticThrustN !== p.staticThrustN ||
        existing.rpm !== p.rpm ||
        existing.currentA !== p.currentA ||
        existing.electricalPowerW !== p.electricalPowerW;
      if (contradictory) {
        errors.push(
          issue(
            'DATASET_CONTRADICTORY_COMMAND',
            'error',
            'Duplicate command with contradictory values',
            p.pointId,
            { command: p.normalizedDriveCommand, otherPointId: existing.pointId },
          ),
        );
      } else {
        warnings.push(
          issue(
            'DATASET_DUPLICATE_COMMAND',
            'warning',
            'Duplicate identical command points',
            p.pointId,
            { command: p.normalizedDriveCommand },
          ),
        );
      }
    } else {
      commandMap.set(p.normalizedDriveCommand, p);
    }
  }

  const ordered = [...points].sort((a, b) => {
    if (a.normalizedDriveCommand !== b.normalizedDriveCommand) {
      return a.normalizedDriveCommand - b.normalizedDriveCommand;
    }
    return a.pointId < b.pointId ? -1 : a.pointId > b.pointId ? 1 : 0;
  });

  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    if (
      cur.normalizedDriveCommand > prev.normalizedDriveCommand &&
      isFiniteNumber(prev.rpm) &&
      isFiniteNumber(cur.rpm) &&
      prev.rpm > 0 &&
      cur.rpm < prev.rpm * (1 - RPM_DECREASE_WARN_RATIO)
    ) {
      warnings.push(
        issue(
          'DATASET_RPM_DECREASE',
          'warning',
          'Increasing throttle with strongly decreasing RPM',
          cur.pointId,
          { prevRpm: prev.rpm, rpm: cur.rpm },
        ),
      );
    }
    if (
      isFiniteNumber(prev.rpm) &&
      isFiniteNumber(cur.rpm) &&
      cur.rpm > prev.rpm &&
      cur.staticThrustN + THRUST_NEGATIVE_DELTA_WARN < prev.staticThrustN
    ) {
      warnings.push(
        issue(
          'DATASET_THRUST_DECREASE_WITH_RPM',
          'warning',
          'Increasing RPM with decreasing thrust',
          cur.pointId,
          { prevThrust: prev.staticThrustN, thrust: cur.staticThrustN },
        ),
      );
    }
    const dCmd = cur.normalizedDriveCommand - prev.normalizedDriveCommand;
    const dThrust = Math.abs(cur.staticThrustN - prev.staticThrustN);
    if (dCmd > 0 && dCmd < 0.05 && dThrust > Math.max(2, prev.staticThrustN)) {
      warnings.push(
        issue(
          'DATASET_DISCONTINUITY',
          'warning',
          'Suspicious discontinuity between adjacent points',
          cur.pointId,
          { dCmd, dThrust },
        ),
      );
    }
  }

  infos.push(
    issue('DATASET_ORDER_NORMALIZED', 'info', 'Operating points sorted by command then pointId'),
  );

  const ok = errors.length === 0;
  return {
    ok,
    errors,
    warnings,
    infos,
    normalizedPoints: ok ? ordered : null,
  };
}
