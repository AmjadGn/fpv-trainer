import type { ComponentRevisionId } from '@fpv/engineering-kernel';
import type {
  PropulsionCalibrationFingerprint,
  PropulsionCalibrationProfileId,
  PropulsionCalibrationRevisionId,
  PropulsionDatasetRevisionId,
} from './ids';
import type { PropulsionDatasetProvenanceCategory } from './models';

export const PROPULSION_CALIBRATION_SCHEMA_VERSION = '1.1.2';

/**
 * Explicit, versioned corrections applied on top of a validated dataset.
 * Never mutates the source dataset revision.
 */
export interface PropulsionCalibrationCorrections {
  readonly thrustScale: number;
  readonly currentScale: number;
  readonly rpmScale: number;
  readonly motorResponseTimeScale: number;
  readonly propellerSpoolScale: number;
  readonly airDensityReferenceKgPerM3: number | null;
  readonly benchToFlightThrustScale: number | null;
}

export interface PropulsionCalibrationProvenance {
  readonly category: PropulsionDatasetProvenanceCategory;
  readonly rationale: string;
  readonly curator: string | null;
  readonly citationId: string | null;
  readonly knownLimitations: readonly string[];
}

export interface PropulsionCalibrationProfileRevision {
  readonly profileId: PropulsionCalibrationProfileId;
  readonly revisionId: PropulsionCalibrationRevisionId;
  readonly parentRevisionId: PropulsionCalibrationRevisionId | null;
  readonly schemaVersion: string;
  /** Dataset revision this calibration targets (immutable reference). */
  readonly targetDatasetRevisionId: PropulsionDatasetRevisionId;
  readonly motorRevisionId: ComponentRevisionId | null;
  readonly propellerRevisionId: ComponentRevisionId | null;
  readonly corrections: PropulsionCalibrationCorrections;
  readonly provenance: PropulsionCalibrationProvenance;
  readonly fingerprint: PropulsionCalibrationFingerprint;
  readonly publishedAtIso: string | null;
  readonly modelVersion: string;
}

export const IDENTITY_CALIBRATION_CORRECTIONS: PropulsionCalibrationCorrections = {
  thrustScale: 1,
  currentScale: 1,
  rpmScale: 1,
  motorResponseTimeScale: 1,
  propellerSpoolScale: 1,
  airDensityReferenceKgPerM3: null,
  benchToFlightThrustScale: null,
};
