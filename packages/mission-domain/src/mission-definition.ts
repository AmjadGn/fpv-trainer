/**
 * The top-level, immutable mission content definition.
 */

import type { MissionAircraftCompatibilityPolicy } from './aircraft-compatibility';
import {
  asMissionSchemaVersion,
  type MissionCompatibilityVersion,
  type MissionId,
  type MissionSchemaVersion,
  type MissionVersion,
} from './ids';
import type { ObjectiveDefinition, ObjectiveGrouping } from './objectives';
import type {
  CompletionPolicy,
  FailurePolicy,
  ScoreAggregationPolicy,
  TimePolicy,
} from './policies';

/** Current structural schema version produced by `createMissionDefinition`. */
export const MISSION_SCHEMA_VERSION: MissionSchemaVersion = asMissionSchemaVersion('1.0.0');

export interface MissionMetadata {
  readonly title: string;
  readonly description: string;
  readonly tags?: readonly string[];
}

export interface MissionBriefing {
  readonly summary: string;
  readonly objectivesSummary?: readonly string[];
  readonly hints?: readonly string[];
}

/** Inclusive range of compatible location content versions, `min <= max`. */
export interface LocationVersionRange {
  readonly min: number;
  readonly max: number;
}

export interface MissionResultsMetadata {
  readonly showObjectiveBreakdown?: boolean;
  readonly showTimeBonus?: boolean;
  readonly customResultsNote?: string;
}

export interface MissionVersions {
  readonly version: MissionVersion;
  readonly schemaVersion: MissionSchemaVersion;
}

export interface MissionDefinition {
  readonly metadata: MissionMetadata;
  readonly missionId: MissionId;
  readonly versions: MissionVersions;
  readonly requiredLocationId: string;
  readonly locationVersionRange: LocationVersionRange;
  readonly briefing: MissionBriefing;
  readonly aircraftCompatibilityPolicy: MissionAircraftCompatibilityPolicy;
  readonly objectives: readonly ObjectiveDefinition[];
  readonly grouping: ObjectiveGrouping;
  readonly completionPolicy: CompletionPolicy;
  readonly failurePolicy: FailurePolicy;
  readonly timePolicy: TimePolicy;
  readonly scoreAggregationPolicy: ScoreAggregationPolicy;
  readonly resultsMetadata?: MissionResultsMetadata;
  readonly compatibilityVersion: MissionCompatibilityVersion;
}

export interface CreateMissionDefinitionInput {
  readonly metadata: MissionMetadata;
  readonly missionId: MissionId;
  readonly version: MissionVersion;
  readonly schemaVersion?: MissionSchemaVersion;
  readonly compatibilityVersion: MissionCompatibilityVersion;
  readonly requiredLocationId: string;
  readonly locationVersionRange: LocationVersionRange;
  readonly briefing: MissionBriefing;
  readonly aircraftCompatibilityPolicy: MissionAircraftCompatibilityPolicy;
  readonly objectives: readonly ObjectiveDefinition[];
  readonly grouping: ObjectiveGrouping;
  readonly completionPolicy: CompletionPolicy;
  readonly failurePolicy: FailurePolicy;
  readonly timePolicy: TimePolicy;
  readonly scoreAggregationPolicy: ScoreAggregationPolicy;
  readonly resultsMetadata?: MissionResultsMetadata;
}

function assertObjectiveIdsExist(
  label: string,
  ids: readonly string[],
  known: ReadonlySet<string>,
): void {
  for (const id of ids) {
    if (!known.has(id)) {
      throw new Error(`MissionDefinition grouping.${label} references unknown objectiveId "${id}"`);
    }
  }
}

/**
 * Builds a `MissionDefinition`, validating the structural invariants that
 * are cheap and unconditionally true for any valid mission (not the full
 * aircraft/location compatibility checks, which are runtime-context
 * dependent — see `compatibility.ts`). Throws on invariant violations,
 * mirroring `simulation-contracts`'s "throw on structural invariant"
 * convention for constructors that aren't validating external/untrusted
 * input.
 */
export function createMissionDefinition(input: CreateMissionDefinitionInput): MissionDefinition {
  if (input.locationVersionRange.min > input.locationVersionRange.max) {
    throw new Error(
      `MissionDefinition locationVersionRange.min (${input.locationVersionRange.min}) must be ` +
        `<= max (${input.locationVersionRange.max})`,
    );
  }

  const knownObjectiveIds = new Set<string>(
    input.objectives.map((objective) => objective.objectiveId),
  );
  if (knownObjectiveIds.size !== input.objectives.length) {
    throw new Error('MissionDefinition objectives must have unique objectiveId values');
  }
  assertObjectiveIdsExist(
    'requiredObjectiveIds',
    input.grouping.requiredObjectiveIds,
    knownObjectiveIds,
  );
  if (input.grouping.optionalObjectiveIds) {
    assertObjectiveIdsExist(
      'optionalObjectiveIds',
      input.grouping.optionalObjectiveIds,
      knownObjectiveIds,
    );
  }
  if (input.grouping.bonusObjectiveIds) {
    assertObjectiveIdsExist(
      'bonusObjectiveIds',
      input.grouping.bonusObjectiveIds,
      knownObjectiveIds,
    );
  }

  if (input.completionPolicy.mode === 'return_zone_after_required') {
    assertObjectiveIdsExist(
      'completionPolicy.returnZoneObjectiveId',
      [input.completionPolicy.returnZoneObjectiveId],
      knownObjectiveIds,
    );
  }
  if (
    input.completionPolicy.mode === 'minimum_count' &&
    (input.completionPolicy.minimumCount < 0 ||
      input.completionPolicy.minimumCount > input.grouping.requiredObjectiveIds.length)
  ) {
    throw new Error(
      'MissionDefinition completionPolicy.minimumCount must be between 0 and ' +
        'grouping.requiredObjectiveIds.length',
    );
  }

  return {
    metadata: input.metadata,
    missionId: input.missionId,
    versions: {
      version: input.version,
      schemaVersion: input.schemaVersion ?? MISSION_SCHEMA_VERSION,
    },
    requiredLocationId: input.requiredLocationId,
    locationVersionRange: input.locationVersionRange,
    briefing: input.briefing,
    aircraftCompatibilityPolicy: input.aircraftCompatibilityPolicy,
    objectives: input.objectives,
    grouping: input.grouping,
    completionPolicy: input.completionPolicy,
    failurePolicy: input.failurePolicy,
    timePolicy: input.timePolicy,
    scoreAggregationPolicy: input.scoreAggregationPolicy,
    ...(input.resultsMetadata !== undefined ? { resultsMetadata: input.resultsMetadata } : {}),
    compatibilityVersion: input.compatibilityVersion,
  };
}
