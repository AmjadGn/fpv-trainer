/**
 * Mission-level completion, failure, timing, and scoring policies.
 */

import type { ElapsedTicks } from '@fpv/simulation-contracts';
import type { ObjectiveId } from './ids';
import type { ObjectiveScoreAllocationPolicy } from './score-allocation';

/**
 * How a mission attempt is deemed complete.
 *  - 'all_required': every required objective must be completed.
 *  - 'minimum_count': at least `minimumCount` of the required objectives
 *    must be completed (order-independent).
 *  - 'return_zone_after_required': every required objective must be
 *    completed AND the aircraft must subsequently reach
 *    `returnZoneObjectiveId`.
 */
export type CompletionPolicy =
  | { readonly mode: 'all_required' }
  | { readonly mode: 'minimum_count'; readonly minimumCount: number }
  | { readonly mode: 'return_zone_after_required'; readonly returnZoneObjectiveId: ObjectiveId };

export interface CrashFailureRule {
  readonly enabled: boolean;
}

export interface OutOfBoundsFailureRule {
  readonly enabled: boolean;
  /** Ticks the aircraft may remain out of bounds before failure triggers. */
  readonly graceTicks: ElapsedTicks;
}

export interface TimeoutFailureRule {
  /** When true, exceeding `TimePolicy.hardLimitTicks` fails the mission. */
  readonly enabled: boolean;
}

export interface InfrastructureFailureRule {
  /**
   * Covers non-gameplay failures (location failed to load, runtime
   * preparation failed, spatial query engine unavailable). See
   * `FailureReasonCode`.
   */
  readonly enabled: boolean;
}

export interface ProhibitedZoneFailureRule {
  readonly enabled: boolean;
  readonly zoneIds: readonly string[];
}

/** Declares which failure conditions are active for a mission, and their parameters. */
export interface FailurePolicy {
  readonly crash: CrashFailureRule;
  readonly outOfBoundsAfterGrace: OutOfBoundsFailureRule;
  readonly timeout: TimeoutFailureRule;
  readonly infrastructure: InfrastructureFailureRule;
  readonly prohibitedZone: ProhibitedZoneFailureRule;
}

/**
 * Machine-readable reasons a mission attempt failed. `prohibitedZone` and
 * `outOfBoundsAfterGrace` both surface as `OUT_OF_BOUNDS` (both are
 * boundary-violation failures from the pilot's perspective); the
 * distinguishing zone/rule detail lives on the runtime event that
 * triggered `missionFailureDetected`, not in this enum.
 */
export type FailureReasonCode =
  | 'AIRCRAFT_CRASHED'
  | 'OUT_OF_BOUNDS'
  | 'TIME_LIMIT_EXCEEDED'
  | 'LOCATION_LOAD_FAILED'
  | 'RUNTIME_PREPARATION_FAILED'
  | 'SPATIAL_QUERY_UNAVAILABLE'
  | 'INVALID_MISSION_CONTENT';

export interface TimeBonusPolicy {
  readonly maxBonusPoints: number;
  readonly targetElapsedTicks: ElapsedTicks;
}

/**
 * `hardLimitTicks: null` means the mission has no time limit at all —
 * this is the mechanism for "unsupported/unbounded" time constraints,
 * distinct from endurance (which is never representable as a constraint;
 * see aircraft-compatibility.ts).
 */
export interface TimePolicy {
  readonly hardLimitTicks: ElapsedTicks | null;
  readonly timeBonus?: TimeBonusPolicy;
}

export interface ScoreAggregationPolicy {
  readonly requiredWeight: number;
  readonly optionalBonusWeight: number;
  readonly timeBonusEnabled: boolean;
  readonly maxScore: number;
  /**
   * Authored required-objective point budgets. When present, application
   * runtimes MUST use it to map normalized photography scores into mission
   * points — they must not invent equal splits from objective count.
   */
  readonly objectiveScoreAllocation?: ObjectiveScoreAllocationPolicy;
}
