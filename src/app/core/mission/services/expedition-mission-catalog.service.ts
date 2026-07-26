import { Injectable } from '@angular/core';
import type { MissionDefinition } from '@fpv/mission-domain';
import type { PhotographyObjectiveDefinition, PhotographyScoringPolicy } from '@fpv/photography-domain';
import { validateMissionDefinition } from '@fpv/location-validation';

import {
  COASTAL_RUINS_PHOTO_OBJECTIVES,
  COASTAL_RUINS_SCORING_POLICY,
  getCoastalRuinsSurveyMission,
  getMediterraneanExpeditionRegionLocation,
  MEDITERRANEAN_LOCATION_ID,
  MISSION_ID_COASTAL_RUINS_SURVEY,
  MISSION_TITLE_COASTAL_RUINS_SURVEY,
} from '../../../content/locations/mediterranean-expedition-region';

export interface ExpeditionMissionSummary {
  readonly missionId: string;
  readonly title: string;
  readonly locationId: string;
  readonly locationTitle: string;
  readonly subregionId: string;
  readonly briefingSummary: string;
  readonly objectivesSummary: readonly string[];
  readonly recommendedCategories: readonly string[];
  readonly captureScoringEnabled: boolean;
}

export interface ExpeditionMissionPackage {
  readonly summary: ExpeditionMissionSummary;
  readonly mission: MissionDefinition;
  readonly photographyObjectives: readonly PhotographyObjectiveDefinition[];
  readonly scoringPolicy: PhotographyScoringPolicy;
}

/**
 * Catalog of installed expedition missions for the Expeditions entry.
 */
@Injectable({ providedIn: 'root' })
export class ExpeditionMissionCatalog {
  private readonly packages: ExpeditionMissionPackage[];

  constructor() {
    const mission = getCoastalRuinsSurveyMission();
    const location = getMediterraneanExpeditionRegionLocation();
    const report = validateMissionDefinition(mission, {
      location,
      photographyObjectives: [...COASTAL_RUINS_PHOTO_OBJECTIVES],
      scoringPolicies: [COASTAL_RUINS_SCORING_POLICY],
    });
    if (!report.ok) {
      throw new Error(
        `Coastal Ruins Survey failed mission validation: ${report.issues
          .map((i) => i.code)
          .join(', ')}`,
      );
    }

    this.packages = [
      {
        summary: {
          missionId: MISSION_ID_COASTAL_RUINS_SURVEY,
          title: MISSION_TITLE_COASTAL_RUINS_SURVEY,
          locationId: MEDITERRANEAN_LOCATION_ID,
          locationTitle: location.display.name,
          subregionId: 'coastal-ruins',
          briefingSummary: mission.briefing.summary,
          objectivesSummary: mission.briefing.objectivesSummary ?? [],
          recommendedCategories:
            mission.aircraftCompatibilityPolicy.recommendedCategories ?? [],
          captureScoringEnabled: false,
        },
        mission,
        photographyObjectives: COASTAL_RUINS_PHOTO_OBJECTIVES,
        scoringPolicy: COASTAL_RUINS_SCORING_POLICY,
      },
    ];
  }

  list(): readonly ExpeditionMissionSummary[] {
    return this.packages.map((p) => p.summary);
  }

  get(missionId: string): ExpeditionMissionPackage | null {
    return this.packages.find((p) => p.summary.missionId === missionId) ?? null;
  }
}
