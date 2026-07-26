/**
 * Mission objective definitions.
 *
 * Photography objectives are intentionally opaque here: they reference a
 * `photographyObjectiveId` string owned and defined by
 * `@fpv/photography-domain`. mission-domain never imports that package
 * (it would create a circular dependency, since photography-domain is
 * mission-aware at a higher level) — it only carries the id forward so a
 * runtime orchestrator can resolve the full photography objective
 * definition and report an evaluation result back via
 * `ObjectiveResult.photographyEvaluationRef` (see results.ts).
 */

import type { MissionVersion, ObjectiveId } from './ids';

interface ObjectiveDefinitionBase {
  readonly objectiveId: ObjectiveId;
  readonly version: MissionVersion;
  readonly required: boolean;
  readonly optional?: boolean;
  readonly bonus?: boolean;
  readonly displayName?: string;
}

export interface PhotographyObjectiveDefinition extends ObjectiveDefinitionBase {
  readonly kind: 'photography';
  /** Opaque reference into `@fpv/photography-domain`'s objective catalog. */
  readonly photographyObjectiveId: string;
}

export interface ReachZoneObjectiveDefinition extends ObjectiveDefinitionBase {
  readonly kind: 'reach_zone';
  /** Opaque reference into the mission's location zone data. */
  readonly zoneId: string;
}

export interface ReturnToZoneObjectiveDefinition extends ObjectiveDefinitionBase {
  readonly kind: 'return_to_zone';
  /** Opaque reference into the mission's location zone data. */
  readonly zoneId: string;
  /**
   * When true, this objective only becomes reachable after all *required*
   * objectives are complete (e.g. "return to launch" as a final step).
   * Enforced at the session/grouping level, not by this type alone.
   */
  readonly afterRequiredObjectives?: boolean;
}

/** Discriminated union over every supported objective category. */
export type ObjectiveDefinition =
  PhotographyObjectiveDefinition | ReachZoneObjectiveDefinition | ReturnToZoneObjectiveDefinition;

export type ObjectiveKind = ObjectiveDefinition['kind'];

export function isPhotographyObjective(
  objective: ObjectiveDefinition,
): objective is PhotographyObjectiveDefinition {
  return objective.kind === 'photography';
}

export function isReachZoneObjective(
  objective: ObjectiveDefinition,
): objective is ReachZoneObjectiveDefinition {
  return objective.kind === 'reach_zone';
}

export function isReturnToZoneObjective(
  objective: ObjectiveDefinition,
): objective is ReturnToZoneObjectiveDefinition {
  return objective.kind === 'return_to_zone';
}

/**
 * Groups a mission's objectives into required/optional/bonus buckets and
 * declares whether they must be completed in order (`sequential`) or can
 * be completed in any order (`all_of`).
 */
export interface ObjectiveGrouping {
  readonly mode: 'sequential' | 'all_of';
  readonly requiredObjectiveIds: readonly ObjectiveId[];
  readonly optionalObjectiveIds?: readonly ObjectiveId[];
  readonly bonusObjectiveIds?: readonly ObjectiveId[];
}

/** Finds an objective definition by id, or `undefined` if absent. */
export function findObjectiveById(
  objectives: readonly ObjectiveDefinition[],
  objectiveId: ObjectiveId,
): ObjectiveDefinition | undefined {
  return objectives.find((objective) => objective.objectiveId === objectiveId);
}
