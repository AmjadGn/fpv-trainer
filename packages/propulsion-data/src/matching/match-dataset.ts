import type { ComponentRevisionId } from '@fpv/engineering-kernel';
import type {
  PropulsionDatasetEligibilityPolicy,
} from '../domain/policy';
import { confidenceMeetsMinimum } from '../domain/policy';
import type {
  PropulsionMatchQuality,
  PropulsionPerformanceDatasetRevision,
  PropulsionDatasetProvenanceCategory,
} from '../domain/models';
import { voltagesCompatible } from '../interpolation/voltage';
import type { PropulsionCalibrationRevisionId } from '../domain/ids';

export interface PropulsionMatchQuery {
  readonly motorRevisionId: ComponentRevisionId | string;
  readonly propellerRevisionId: ComponentRevisionId | string;
  readonly batteryNominalVoltageV: number;
  readonly escRevisionId: ComponentRevisionId | string | null;
  readonly airDensityKgPerM3: number | null;
  readonly policy: PropulsionDatasetEligibilityPolicy;
  readonly calibrationRevisionId?: PropulsionCalibrationRevisionId | null;
}

export interface PropulsionDatasetMatchResult {
  readonly selected: PropulsionPerformanceDatasetRevision | null;
  readonly matchQuality: PropulsionMatchQuality;
  readonly confidence: PropulsionPerformanceDatasetRevision['confidence']['level'] | 'insufficient';
  readonly fallbackReason: string | null;
  readonly warnings: readonly string[];
  readonly candidatesConsidered: number;
}

type RankedCandidate = {
  readonly dataset: PropulsionPerformanceDatasetRevision;
  readonly qualityRank: number;
  readonly matchQuality: PropulsionMatchQuality;
  readonly voltageDelta: number;
  readonly revisionId: string;
};

const MEASURED_CATEGORIES: ReadonlySet<PropulsionDatasetProvenanceCategory> = new Set([
  'manufacturer-published',
  'independent-bench-measurement',
  'community-measurement',
  'internally-measured',
]);

function qualityRank(q: PropulsionMatchQuality): number {
  switch (q) {
    case 'exact-measured':
      return 0;
    case 'voltage-compatible-measured':
      return 1;
    case 'curated-estimate':
      return 2;
    case 'legacy-peak-thrust-hint':
      return 3;
    default:
      return 99;
  }
}

function isMeasured(cat: PropulsionDatasetProvenanceCategory): boolean {
  return MEASURED_CATEGORIES.has(cat);
}

/**
 * Deterministic dataset selection.
 *
 * Order:
 *   exact measured (exact motor+prop+voltage)
 *   → compatible measured with documented voltage tolerance
 *   → curated estimate
 *   → legacy peakThrustHint fallback (caller)
 *
 * Tie-break: lower qualityRank, then smaller |ΔV|, then revisionId lexicographic.
 * Catalog insertion order must not affect selection.
 */
export function matchPropulsionDataset(
  datasets: readonly PropulsionPerformanceDatasetRevision[],
  query: PropulsionMatchQuery,
): PropulsionDatasetMatchResult {
  const warnings: string[] = [];
  const policy = query.policy;

  if (
    query.calibrationRevisionId &&
    policy.calibrationAllowlist &&
    !policy.calibrationAllowlist.includes(query.calibrationRevisionId)
  ) {
    return {
      selected: null,
      matchQuality: 'none',
      confidence: 'insufficient',
      fallbackReason: 'calibration-not-allowlisted',
      warnings: ['PROP_MATCH_CALIBRATION_REJECTED'],
      candidatesConsidered: 0,
    };
  }

  const candidates: RankedCandidate[] = [];

  for (const ds of datasets) {
    if (ds.status !== 'published') continue;
    if (ds.motorRevisionId !== query.motorRevisionId) continue;
    if (ds.propellerRevisionId !== query.propellerRevisionId) continue;
    if (!policy.allowedProvenanceCategories.includes(ds.source.category)) {
      continue;
    }
    if (!confidenceMeetsMinimum(ds.confidence.level, policy.minConfidence)) {
      continue;
    }
    if (policy.measuredDataRequired && !isMeasured(ds.source.category)) {
      continue;
    }
    if (
      ds.source.category === 'synthetic-fallback' &&
      !policy.syntheticFallbackAllowed
    ) {
      continue;
    }

    const voltageOk = voltagesCompatible({
      batteryNominalVoltageV: query.batteryNominalVoltageV,
      datasetTestVoltageV: ds.testVoltageV,
      toleranceV: policy.exactVoltageToleranceV,
    });
    if (!voltageOk) {
      if (!policy.voltageInterpolationAllowed) {
        continue;
      }
      // Voltage interpolation not implemented in v1.1.2 presets — skip.
      warnings.push('PROP_MATCH_VOLTAGE_INTERP_UNSUPPORTED');
      continue;
    }

    if (
      query.airDensityKgPerM3 !== null &&
      Number.isFinite(query.airDensityKgPerM3) &&
      Math.abs(query.airDensityKgPerM3 - ds.environment.airDensityKgPerM3) > 0.05
    ) {
      warnings.push(`PROP_MATCH_DENSITY_DELTA:${ds.revisionId}`);
      // Still eligible — density mismatch is a warning, not a hard reject.
    }

    const exactVoltage =
      Math.abs(query.batteryNominalVoltageV - ds.testVoltageV) < 1e-9;
    let matchQuality: PropulsionMatchQuality;
    if (isMeasured(ds.source.category)) {
      matchQuality = exactVoltage ? 'exact-measured' : 'voltage-compatible-measured';
    } else if (
      ds.source.category === 'curated-estimate' ||
      ds.source.category === 'synthetic-fallback'
    ) {
      matchQuality = 'curated-estimate';
    } else {
      matchQuality = 'curated-estimate';
    }

    candidates.push({
      dataset: ds,
      qualityRank: qualityRank(matchQuality),
      matchQuality,
      voltageDelta: Math.abs(query.batteryNominalVoltageV - ds.testVoltageV),
      revisionId: ds.revisionId,
    });
  }

  candidates.sort((a, b) => {
    if (a.qualityRank !== b.qualityRank) return a.qualityRank - b.qualityRank;
    if (a.voltageDelta !== b.voltageDelta) return a.voltageDelta - b.voltageDelta;
    return a.revisionId < b.revisionId ? -1 : a.revisionId > b.revisionId ? 1 : 0;
  });

  if (candidates.length === 0) {
    return {
      selected: null,
      matchQuality: 'legacy-peak-thrust-hint',
      confidence: 'low',
      fallbackReason: 'no-compatible-dataset',
      warnings: [...warnings, 'PROP_MATCH_NO_DATASET'],
      candidatesConsidered: datasets.length,
    };
  }

  const best = candidates[0];
  const tied = candidates.filter(
    (c) =>
      c.qualityRank === best.qualityRank &&
      c.voltageDelta === best.voltageDelta &&
      c.revisionId !== best.revisionId &&
      // Same physical fingerprint would be idempotent; different content is conflict.
      c.dataset.fingerprint !== best.dataset.fingerprint,
  );
  if (tied.length > 0) {
    // Deterministic tie-break already chose best by revisionId; emit warning.
    warnings.push('PROP_MATCH_AMBIGUOUS_TIE_BROKEN_BY_REVISION_ID');
  }

  return {
    selected: best.dataset,
    matchQuality: best.matchQuality,
    confidence: best.dataset.confidence.level,
    fallbackReason: null,
    warnings,
    candidatesConsidered: datasets.length,
  };
}
