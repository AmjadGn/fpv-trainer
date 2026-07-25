import type { ComponentRevisionId, Volts, Amperes, Watts, Newtons, NewtonMeters } from '@fpv/engineering-kernel';
import type {
  PropulsionDatasetFingerprint,
  PropulsionDatasetId,
  PropulsionDatasetReleaseId,
  PropulsionDatasetRevisionId,
} from './ids';

/** Schema version for propulsion performance datasets. */
export const PROPULSION_DATASET_SCHEMA_VERSION = '1.1.2';

/**
 * Provenance categories for propulsion performance data.
 * Never label curated or synthetic values as measured.
 */
export type PropulsionDatasetProvenanceCategory =
  | 'manufacturer-published'
  | 'independent-bench-measurement'
  | 'community-measurement'
  | 'internally-measured'
  | 'curated-estimate'
  | 'synthetic-fallback';

export type PropulsionDatasetConfidenceLevel =
  | 'high'
  | 'medium'
  | 'low'
  | 'insufficient';

export type PropulsionDatasetStatus =
  | 'draft'
  | 'published'
  | 'deprecated'
  | 'archived';

export type PropulsionMatchQuality =
  | 'exact-measured'
  | 'voltage-compatible-measured'
  | 'curated-estimate'
  | 'legacy-peak-thrust-hint'
  | 'none';

export type PropulsionDataSourceMode =
  | 'measured-table'
  | 'curated-estimate-table'
  | 'peak-thrust-hint-fallback'
  | 'synthetic-fallback';

/**
 * Source / measurement provenance metadata.
 * Presentation-only narrative fields are excluded from the physical fingerprint.
 */
export interface PropulsionDatasetSource {
  readonly category: PropulsionDatasetProvenanceCategory;
  readonly sourceName: string;
  readonly citationId: string | null;
  readonly measurementDateIso: string | null;
  readonly testEquipment: string | null;
  readonly testMethod: string | null;
  readonly sampleCount: number | null;
  readonly curator: string | null;
  readonly licenseOrUsage: string | null;
  /** Presentation-only notes — excluded from physical fingerprint. */
  readonly notes: string | null;
  readonly knownLimitations: readonly string[];
}

export interface PropulsionDatasetEnvironment {
  readonly airDensityKgPerM3: number;
  readonly ambientTemperatureK: number | null;
  readonly altitudeMeters: number | null;
  readonly referenceLabel: string | null;
}

export interface PropulsionDatasetConfidence {
  readonly level: PropulsionDatasetConfidenceLevel;
  readonly rationale: string;
  readonly competitiveEligible: boolean;
}

/**
 * Drive / ESC assumptions for the tested configuration.
 * Not a full ESC model — documents the bench drive context.
 */
export interface PropulsionDatasetDriveAssumptions {
  readonly escRevisionId: ComponentRevisionId | null;
  readonly protocol: string | null;
  readonly timingAdvanceDeg: number | null;
  readonly notes: string | null;
}

/**
 * Single operating point in SI units after ingestion normalization.
 * Primary independent variable for v1.1.2 interpolation: normalizedDriveCommand.
 */
export interface PropulsionOperatingPoint {
  /** Stable point identity within the revision (not catalog order). */
  readonly pointId: string;
  /** Normalized drive command in [0, 1]. Primary interpolation axis. */
  readonly normalizedDriveCommand: number;
  readonly rpm: number | null;
  readonly voltageV: Volts;
  readonly currentA: Amperes | null;
  readonly electricalPowerW: Watts | null;
  readonly staticThrustN: Newtons;
  readonly torqueNm: NewtonMeters | null;
  /** Efficiency as thrust/(power) or documented ratio; null if unavailable. */
  readonly efficiency: number | null;
  readonly motorTemperatureK: number | null;
}

/**
 * Immutable performance dataset revision for a specific motor+prop+voltage
 * configuration. Component revisions remain stable; datasets are published
 * separately and referenced by immutable IDs (ADR-025).
 */
export interface PropulsionPerformanceDatasetRevision {
  readonly datasetId: PropulsionDatasetId;
  readonly revisionId: PropulsionDatasetRevisionId;
  readonly parentRevisionId: PropulsionDatasetRevisionId | null;
  readonly schemaVersion: string;
  readonly status: PropulsionDatasetStatus;
  readonly motorRevisionId: ComponentRevisionId;
  readonly propellerRevisionId: ComponentRevisionId;
  /** Battery cell count used during the test, when known. */
  readonly cellCount: number | null;
  /** Nominal / declared test voltage (SI volts). */
  readonly testVoltageV: Volts;
  readonly fullyChargedVoltageV: Volts | null;
  readonly drive: PropulsionDatasetDriveAssumptions;
  readonly environment: PropulsionDatasetEnvironment;
  readonly source: PropulsionDatasetSource;
  readonly confidence: PropulsionDatasetConfidence;
  readonly operatingPoints: readonly PropulsionOperatingPoint[];
  /** Physical fingerprint of interpolation-affecting fields. */
  readonly fingerprint: PropulsionDatasetFingerprint;
  readonly publishedAtIso: string | null;
  readonly modelVersion: string;
}

export interface PropulsionDatasetRelease {
  readonly releaseId: PropulsionDatasetReleaseId;
  readonly version: string;
  readonly datasetRevisionIds: readonly PropulsionDatasetRevisionId[];
  readonly publishedAtIso: string | null;
  readonly label: string;
}

export type PropulsionDatasetValidationSeverity = 'error' | 'warning' | 'info';

export interface PropulsionDatasetValidationIssue {
  readonly code: string;
  readonly severity: PropulsionDatasetValidationSeverity;
  readonly message: string;
  readonly pointId: string | null;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
}

export interface PropulsionDatasetValidationResult {
  readonly ok: boolean;
  readonly errors: readonly PropulsionDatasetValidationIssue[];
  readonly warnings: readonly PropulsionDatasetValidationIssue[];
  readonly infos: readonly PropulsionDatasetValidationIssue[];
  /** Deterministically ordered operating points when ok. */
  readonly normalizedPoints: readonly PropulsionOperatingPoint[] | null;
}
