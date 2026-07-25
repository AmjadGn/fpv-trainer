import type { PropulsionCalibrationProfileRevision } from '../domain/calibration';
import {
  IDENTITY_CALIBRATION_CORRECTIONS,
  PROPULSION_CALIBRATION_SCHEMA_VERSION,
} from '../domain/calibration';
import {
  asPropulsionCalibrationProfileId,
  asPropulsionCalibrationRevisionId,
  asPropulsionDatasetRevisionId,
} from '../domain/ids';
import { fingerprintPropulsionCalibration } from '../fingerprinting/fingerprint';

/**
 * Identity calibration for apex fixture — documents the calibration profile
 * architecture without altering physical output (all scales = 1).
 */
export function buildApexIdentityCalibration(): PropulsionCalibrationProfileRevision {
  const draft: Omit<PropulsionCalibrationProfileRevision, 'fingerprint'> = {
    profileId: asPropulsionCalibrationProfileId('cal-apex-r5-identity'),
    revisionId: asPropulsionCalibrationRevisionId('cal-apex-r5-identity@1'),
    parentRevisionId: null,
    schemaVersion: PROPULSION_CALIBRATION_SCHEMA_VERSION,
    targetDatasetRevisionId: asPropulsionDatasetRevisionId('ds-apex-r5-2306-5x4x3@1'),
    motorRevisionId: null,
    propellerRevisionId: null,
    corrections: { ...IDENTITY_CALIBRATION_CORRECTIONS },
    provenance: {
      category: 'curated-estimate',
      rationale:
        'Identity calibration demonstrating explicit versioned profile without mutating source dataset.',
      curator: 'fpv-trainer-engineering',
      citationId: null,
      knownLimitations: ['identity-only', 'no-bench-to-flight-correction'],
    },
    publishedAtIso: null,
    modelVersion: '1.1.2-identity',
  };
  return {
    ...draft,
    fingerprint: fingerprintPropulsionCalibration(draft),
  };
}

export const FACTORY_FIXTURE_CALIBRATIONS: readonly PropulsionCalibrationProfileRevision[] =
  [buildApexIdentityCalibration()];
