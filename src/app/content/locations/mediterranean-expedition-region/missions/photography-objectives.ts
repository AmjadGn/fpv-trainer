import { asElapsedTicks } from '@fpv/simulation-contracts';
import {
  asPhotographyObjectiveId,
  asSubjectId,
  createDefaultPhotographyScoringPolicy,
  type PhotographyObjectiveDefinition,
  type PhotographyScoringPolicy,
} from '@fpv/photography-domain';

import { SUBJECT_IDS } from '../identity';

/**
 * Photography objective definitions for Coastal Ruins Survey.
 * Capture/scoring runtime is deferred to Checkpoint 5 — definitions are structurally valid.
 */
export const COASTAL_RUINS_PHOTO_OBJECTIVES: readonly PhotographyObjectiveDefinition[] = [
  {
    objectiveId: asPhotographyObjectiveId('photo-coastal-arch-01'),
    version: '1.0.0',
    requiredSubjectIds: [asSubjectId(SUBJECT_IDS.stoneSeaArch)],
    minRequiredSubjectCount: 1,
    primarySubjectIds: [asSubjectId(SUBJECT_IDS.stoneSeaArch)],
    visibilityMin: 0.45,
    coverageRange: { min: 0.08, max: 0.55 },
    centeringTarget: { targetAnchor: { u: 0.5, v: 0.48 }, maxCenteringError: 0.28 },
    cameraToSubjectDistanceRange: { min: 8, max: 45 },
    viewingAngleRangeDeg: { min: 0, max: 55 },
    allowedViewingSides: ['front', 'left', 'right'],
    altitudeRange: { minMeters: 1, maxMeters: 35 },
    lineOfSightMin: 0.6,
    obstructionMax: 0.4,
    maxLinearSpeedMps: 8,
    maxBodyAngularSpeedRadps: 1.8,
    stabilityDurationTicks: asElapsedTicks(24),
    attemptPolicy: { retryable: true },
  },
  {
    objectiveId: asPhotographyObjectiveId('photo-coastal-lookout-01'),
    version: '1.0.0',
    requiredSubjectIds: [asSubjectId(SUBJECT_IDS.ruinedLookout)],
    minRequiredSubjectCount: 1,
    primarySubjectIds: [asSubjectId(SUBJECT_IDS.ruinedLookout)],
    visibilityMin: 0.45,
    coverageRange: { min: 0.1, max: 0.6 },
    centeringTarget: { targetAnchor: { u: 0.5, v: 0.42 }, maxCenteringError: 0.3 },
    cameraToSubjectDistanceRange: { min: 10, max: 50 },
    viewingAngleRangeDeg: { min: 0, max: 60 },
    allowedViewingSides: ['front', 'left', 'right'],
    altitudeRange: { minMeters: 2, maxMeters: 40 },
    lineOfSightMin: 0.55,
    obstructionMax: 0.45,
    maxLinearSpeedMps: 8,
    maxBodyAngularSpeedRadps: 1.8,
    stabilityDurationTicks: asElapsedTicks(24),
    attemptPolicy: { retryable: true },
  },
  {
    objectiveId: asPhotographyObjectiveId('photo-coastal-cliff-01'),
    version: '1.0.0',
    requiredSubjectIds: [asSubjectId(SUBJECT_IDS.cliffsideRuin)],
    minRequiredSubjectCount: 1,
    primarySubjectIds: [asSubjectId(SUBJECT_IDS.cliffsideRuin)],
    visibilityMin: 0.4,
    coverageRange: { min: 0.12, max: 0.65 },
    centeringTarget: { targetAnchor: { u: 0.5, v: 0.5 }, maxCenteringError: 0.32 },
    cameraToSubjectDistanceRange: { min: 8, max: 40 },
    viewingAngleRangeDeg: { min: 0, max: 50 },
    allowedViewingSides: ['front', 'right'],
    altitudeRange: { minMeters: 4, maxMeters: 45 },
    lineOfSightMin: 0.55,
    obstructionMax: 0.45,
    maxLinearSpeedMps: 8,
    maxBodyAngularSpeedRadps: 1.8,
    stabilityDurationTicks: asElapsedTicks(24),
    attemptPolicy: { retryable: true },
  },
];

export const COASTAL_RUINS_SCORING_POLICY: PhotographyScoringPolicy =
  createDefaultPhotographyScoringPolicy();
