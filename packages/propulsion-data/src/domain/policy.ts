import type { PropulsionDatasetProvenanceCategory, PropulsionDatasetConfidenceLevel } from './models';
import type { PropulsionCalibrationRevisionId } from './ids';

/**
 * Dataset eligibility policy for compilation contexts.
 * Changes must affect CompilationContextFingerprint, not BuildFingerprint.
 *
 * Free Flight may allow low-confidence / synthetic fallbacks.
 * Ranked / competitive policy may reject missing measured data — but factory
 * aircraft must not enable strict measured-data requirements until qualifying
 * datasets exist.
 */
export interface PropulsionDatasetEligibilityPolicy {
  readonly minConfidence: PropulsionDatasetConfidenceLevel;
  readonly allowedProvenanceCategories: readonly PropulsionDatasetProvenanceCategory[];
  readonly measuredDataRequired: boolean;
  readonly syntheticFallbackAllowed: boolean;
  readonly legacyPeakThrustHintAllowed: boolean;
  /** Max |ΔV| for exact-voltage match (volts). */
  readonly exactVoltageToleranceV: number;
  /** Whether voltage interpolation between two datasets is allowed. */
  readonly voltageInterpolationAllowed: boolean;
  /** Max command-distance outside measured envelope before clamp warning. */
  readonly maxInterpolationDistance: number;
  readonly calibrationAllowlist: readonly PropulsionCalibrationRevisionId[] | null;
}

export const FREE_FLIGHT_DATASET_POLICY: PropulsionDatasetEligibilityPolicy = {
  minConfidence: 'low',
  allowedProvenanceCategories: [
    'manufacturer-published',
    'independent-bench-measurement',
    'community-measurement',
    'internally-measured',
    'curated-estimate',
    'synthetic-fallback',
  ],
  measuredDataRequired: false,
  syntheticFallbackAllowed: true,
  legacyPeakThrustHintAllowed: true,
  exactVoltageToleranceV: 0.05,
  voltageInterpolationAllowed: false,
  maxInterpolationDistance: 0,
  calibrationAllowlist: null,
};

/**
 * Ranked policy capability — still allows legacy fallback for factory content
 * until measured datasets exist. measuredDataRequired remains false in v1.1.2.
 */
export const RANKED_DATASET_POLICY: PropulsionDatasetEligibilityPolicy = {
  minConfidence: 'medium',
  allowedProvenanceCategories: [
    'manufacturer-published',
    'independent-bench-measurement',
    'internally-measured',
    'curated-estimate',
  ],
  measuredDataRequired: false,
  syntheticFallbackAllowed: false,
  legacyPeakThrustHintAllowed: true,
  exactVoltageToleranceV: 0.05,
  voltageInterpolationAllowed: false,
  maxInterpolationDistance: 0,
  calibrationAllowlist: null,
};

const CONFIDENCE_RANK: Record<PropulsionDatasetConfidenceLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
  insufficient: 0,
};

export function confidenceMeetsMinimum(
  level: PropulsionDatasetConfidenceLevel,
  minimum: PropulsionDatasetConfidenceLevel,
): boolean {
  return CONFIDENCE_RANK[level] >= CONFIDENCE_RANK[minimum];
}

/** Canonical subset hashed into CompilationContextFingerprint. */
export function datasetPolicyFingerprintPayload(
  policy: PropulsionDatasetEligibilityPolicy,
): Record<string, unknown> {
  return {
    minConfidence: policy.minConfidence,
    allowedProvenanceCategories: [...policy.allowedProvenanceCategories].sort(),
    measuredDataRequired: policy.measuredDataRequired,
    syntheticFallbackAllowed: policy.syntheticFallbackAllowed,
    legacyPeakThrustHintAllowed: policy.legacyPeakThrustHintAllowed,
    exactVoltageToleranceV: policy.exactVoltageToleranceV,
    voltageInterpolationAllowed: policy.voltageInterpolationAllowed,
    maxInterpolationDistance: policy.maxInterpolationDistance,
    calibrationAllowlist: policy.calibrationAllowlist
      ? [...policy.calibrationAllowlist].sort()
      : null,
  };
}
