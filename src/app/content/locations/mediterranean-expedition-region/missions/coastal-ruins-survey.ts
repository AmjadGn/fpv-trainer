import { asElapsedTicks } from '@fpv/simulation-contracts';
import {
  asMissionCompatibilityVersion,
  asMissionId,
  asMissionVersion,
  asObjectiveId,
  createMissionDefinition,
  type MissionDefinition,
} from '@fpv/mission-domain';

import {
  MEDITERRANEAN_LOCATION_ID,
  MISSION_ID_COASTAL_RUINS_SURVEY,
  MISSION_TITLE_COASTAL_RUINS_SURVEY,
} from '../identity';

const OBJ_ARCH = asObjectiveId('obj-photo-arch');
const OBJ_LOOKOUT = asObjectiveId('obj-photo-lookout');
const OBJ_CLIFF = asObjectiveId('obj-photo-cliff');

/**
 * Coastal Ruins Survey — first structurally valid photography mission.
 * Capture/scoring loop is not enabled in Checkpoint 4.
 */
export function createCoastalRuinsSurveyMission(): MissionDefinition {
  return createMissionDefinition({
    metadata: {
      title: MISSION_TITLE_COASTAL_RUINS_SURVEY,
      description:
        'Survey the Coastal Ruins subregion of the Mediterranean Expedition Region with three sequential photography objectives.',
      tags: ['expedition', 'photography', 'coastal-ruins', 'mediterranean'],
    },
    missionId: asMissionId(MISSION_ID_COASTAL_RUINS_SURVEY),
    version: asMissionVersion('1.0.0'),
    compatibilityVersion: asMissionCompatibilityVersion('1.0.0'),
    requiredLocationId: MEDITERRANEAN_LOCATION_ID,
    locationVersionRange: { min: 1, max: 1 },
    briefing: {
      summary:
        'Launch into the Coastal Ruins pocket, then photograph the stone sea arch, ruined lookout, and cliffside ruin composition in order.',
      objectivesSummary: [
        'Photograph the stone sea arch',
        'Photograph the ruined lookout tower',
        'Photograph the cliffside ruin composition',
      ],
      hints: [
        'Cinewhoop and hybrid aircraft are recommended.',
        'Photography capture and scoring are not yet enabled in this build — you can explore the location.',
        'Stay within the authored Coastal Ruins playable boundary.',
      ],
    },
    aircraftCompatibilityPolicy: {
      recommendedCategories: ['protected-cinewhoop', 'hybrid-fpv', 'micro-fpv'],
      // Oversized long-range platforms are unsuitable for ruin corridors.
      prohibitedCategories: ['long-range-7inch'],
      maxWidthMeters: 0.55,
      requireCamera: true,
      recommendedAircraftIds: ['aeroguard-2', 'velocity-x', 'nano-scout'],
    },
    objectives: [
      {
        kind: 'photography',
        objectiveId: OBJ_ARCH,
        version: asMissionVersion('1.0.0'),
        required: true,
        displayName: 'Photograph the stone sea arch',
        photographyObjectiveId: 'photo-coastal-arch-01',
      },
      {
        kind: 'photography',
        objectiveId: OBJ_LOOKOUT,
        version: asMissionVersion('1.0.0'),
        required: true,
        displayName: 'Photograph the ruined lookout',
        photographyObjectiveId: 'photo-coastal-lookout-01',
      },
      {
        kind: 'photography',
        objectiveId: OBJ_CLIFF,
        version: asMissionVersion('1.0.0'),
        required: true,
        displayName: 'Photograph the cliffside ruin composition',
        photographyObjectiveId: 'photo-coastal-cliff-01',
      },
    ],
    grouping: {
      mode: 'sequential',
      requiredObjectiveIds: [OBJ_ARCH, OBJ_LOOKOUT, OBJ_CLIFF],
    },
    completionPolicy: { mode: 'all_required' },
    failurePolicy: {
      crash: { enabled: true },
      outOfBoundsAfterGrace: { enabled: true, graceTicks: asElapsedTicks(180) },
      timeout: { enabled: false },
      infrastructure: { enabled: true },
      prohibitedZone: { enabled: false, zoneIds: [] },
    },
    timePolicy: {
      hardLimitTicks: null,
      timeBonus: {
        maxBonusPoints: 15,
        targetElapsedTicks: asElapsedTicks(36_000),
      },
    },
    scoreAggregationPolicy: {
      requiredWeight: 1,
      optionalBonusWeight: 0.25,
      timeBonusEnabled: true,
      maxScore: 100,
    },
    resultsMetadata: {
      showObjectiveBreakdown: true,
      showTimeBonus: true,
      customResultsNote:
        'Photography capture/scoring is not enabled in Checkpoint 4. Explore the location; final results are deferred.',
    },
  });
}

let cachedMission: MissionDefinition | null = null;

export function getCoastalRuinsSurveyMission(): MissionDefinition {
  if (!cachedMission) {
    cachedMission = createCoastalRuinsSurveyMission();
  }
  return cachedMission;
}
