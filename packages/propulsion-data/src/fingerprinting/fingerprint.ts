import { hashCanonical } from '@fpv/engineering-kernel';
import {
  asPropulsionCalibrationFingerprint,
  asPropulsionDatasetFingerprint,
  type PropulsionCalibrationFingerprint,
  type PropulsionDatasetFingerprint,
} from '../domain/ids';
import type { PropulsionPerformanceDatasetRevision } from '../domain/models';
import type { PropulsionCalibrationProfileRevision } from '../domain/calibration';

/**
 * Physical fingerprint — every field that can affect interpolation or
 * engineering output. Excludes presentation-only notes and release labels.
 */
export function physicalDatasetPayload(
  dataset: Omit<PropulsionPerformanceDatasetRevision, 'fingerprint'>,
): Record<string, unknown> {
  return {
    datasetId: dataset.datasetId,
    revisionId: dataset.revisionId,
    parentRevisionId: dataset.parentRevisionId,
    schemaVersion: dataset.schemaVersion,
    status: dataset.status,
    motorRevisionId: dataset.motorRevisionId,
    propellerRevisionId: dataset.propellerRevisionId,
    cellCount: dataset.cellCount,
    testVoltageV: dataset.testVoltageV,
    fullyChargedVoltageV: dataset.fullyChargedVoltageV,
    drive: {
      escRevisionId: dataset.drive.escRevisionId,
      protocol: dataset.drive.protocol,
      timingAdvanceDeg: dataset.drive.timingAdvanceDeg,
    },
    environment: {
      airDensityKgPerM3: dataset.environment.airDensityKgPerM3,
      ambientTemperatureK: dataset.environment.ambientTemperatureK,
      altitudeMeters: dataset.environment.altitudeMeters,
    },
    source: {
      category: dataset.source.category,
      sourceName: dataset.source.sourceName,
      citationId: dataset.source.citationId,
      measurementDateIso: dataset.source.measurementDateIso,
      testEquipment: dataset.source.testEquipment,
      testMethod: dataset.source.testMethod,
      sampleCount: dataset.source.sampleCount,
      curator: dataset.source.curator,
      licenseOrUsage: dataset.source.licenseOrUsage,
      knownLimitations: [...dataset.source.knownLimitations].sort(),
    },
    confidence: {
      level: dataset.confidence.level,
      competitiveEligible: dataset.confidence.competitiveEligible,
    },
    operatingPoints: [...dataset.operatingPoints]
      .map((p) => ({
        pointId: p.pointId,
        normalizedDriveCommand: p.normalizedDriveCommand,
        rpm: p.rpm,
        voltageV: p.voltageV,
        currentA: p.currentA,
        electricalPowerW: p.electricalPowerW,
        staticThrustN: p.staticThrustN,
        torqueNm: p.torqueNm,
        efficiency: p.efficiency,
        motorTemperatureK: p.motorTemperatureK,
      }))
      .sort((a, b) =>
        a.pointId < b.pointId ? -1 : a.pointId > b.pointId ? 1 : 0,
      ),
    modelVersion: dataset.modelVersion,
  };
}

export function fingerprintPropulsionDataset(
  dataset: Omit<PropulsionPerformanceDatasetRevision, 'fingerprint'>,
): PropulsionDatasetFingerprint {
  return asPropulsionDatasetFingerprint(hashCanonical(physicalDatasetPayload(dataset)));
}

export function physicalCalibrationPayload(
  profile: Omit<PropulsionCalibrationProfileRevision, 'fingerprint'>,
): Record<string, unknown> {
  return {
    profileId: profile.profileId,
    revisionId: profile.revisionId,
    parentRevisionId: profile.parentRevisionId,
    schemaVersion: profile.schemaVersion,
    targetDatasetRevisionId: profile.targetDatasetRevisionId,
    motorRevisionId: profile.motorRevisionId,
    propellerRevisionId: profile.propellerRevisionId,
    corrections: profile.corrections,
    provenance: {
      category: profile.provenance.category,
      rationale: profile.provenance.rationale,
      curator: profile.provenance.curator,
      citationId: profile.provenance.citationId,
      knownLimitations: [...profile.provenance.knownLimitations].sort(),
    },
    modelVersion: profile.modelVersion,
  };
}

export function fingerprintPropulsionCalibration(
  profile: Omit<PropulsionCalibrationProfileRevision, 'fingerprint'>,
): PropulsionCalibrationFingerprint {
  return asPropulsionCalibrationFingerprint(
    hashCanonical(physicalCalibrationPayload(profile)),
  );
}
