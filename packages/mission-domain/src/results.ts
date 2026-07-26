/**
 * Mission attempt results and pure score aggregation.
 */

import type { ElapsedTicks } from '@fpv/simulation-contracts';
import type { MissionId, MissionResultId, MissionSessionId, ObjectiveId } from './ids';
import type { FailureReasonCode, ScoreAggregationPolicy, TimePolicy } from './policies';

export type MissionStatus = 'completed' | 'failed';

export interface MissionScore {
  readonly requiredPoints: number;
  readonly optionalBonusPoints: number;
  readonly timeBonusPoints: number;
  /** Integer, sum of the above, clamped to `maxScore`. */
  readonly finalScore: number;
  readonly maxScore: number;
}

export type ObjectiveResultStatus = 'completed' | 'failed' | 'skipped' | 'incomplete';

export interface ObjectiveResult {
  readonly objectiveId: ObjectiveId;
  readonly status: ObjectiveResultStatus;
  readonly scorePoints: number;
  readonly maxPoints: number;
  /** Opaque reference to a `@fpv/photography-domain` evaluation, for photography objectives. */
  readonly photographyEvaluationRef?: string;
}

export interface MissionResultRecord {
  readonly resultId: MissionResultId;
  readonly missionId: MissionId;
  readonly sessionId: MissionSessionId;
  readonly status: MissionStatus;
  readonly failureReasonCode?: FailureReasonCode;
  readonly objectiveResults: readonly ObjectiveResult[];
  readonly score: MissionScore;
  readonly elapsedTicks: ElapsedTicks;
}

export interface AggregateMissionResultInput {
  readonly objectiveResults: readonly ObjectiveResult[];
  readonly requiredObjectiveIds: readonly ObjectiveId[];
  readonly scoreAggregationPolicy: ScoreAggregationPolicy;
  readonly timePolicy: TimePolicy;
  readonly elapsedTicks: ElapsedTicks;
}

export interface AggregateMissionResultOutput {
  readonly status: MissionStatus;
  readonly score: MissionScore;
}

function findResult(
  results: readonly ObjectiveResult[],
  objectiveId: ObjectiveId,
): ObjectiveResult | undefined {
  return results.find((result) => result.objectiveId === objectiveId);
}

/**
 * Aggregates a mission attempt's final status and score, purely from its
 * objective results and policies.
 *
 * Pass/fail is decided strictly by whether every required objective was
 * completed — NOT by the resulting score. A mission with a low score but
 * all required objectives completed is still `'completed'`; a mission
 * that racked up bonus points but missed a required objective is still
 * `'failed'`.
 */
export function aggregateMissionResult(
  input: AggregateMissionResultInput,
): AggregateMissionResultOutput {
  const {
    objectiveResults,
    requiredObjectiveIds,
    scoreAggregationPolicy,
    timePolicy,
    elapsedTicks,
  } = input;

  const allRequiredCompleted = requiredObjectiveIds.every(
    (objectiveId) => findResult(objectiveResults, objectiveId)?.status === 'completed',
  );

  const requiredIdSet = new Set<ObjectiveId>(requiredObjectiveIds);

  const requiredPointsRaw = objectiveResults
    .filter((result) => requiredIdSet.has(result.objectiveId) && result.status === 'completed')
    .reduce((sum, result) => sum + result.scorePoints, 0);

  const optionalBonusPointsRaw = objectiveResults
    .filter((result) => !requiredIdSet.has(result.objectiveId) && result.status === 'completed')
    .reduce((sum, result) => sum + result.scorePoints, 0);

  const requiredPoints = requiredPointsRaw * scoreAggregationPolicy.requiredWeight;
  const optionalBonusPoints = optionalBonusPointsRaw * scoreAggregationPolicy.optionalBonusWeight;

  let timeBonusPoints = 0;
  if (
    scoreAggregationPolicy.timeBonusEnabled &&
    timePolicy.timeBonus !== undefined &&
    allRequiredCompleted &&
    (elapsedTicks as number) <= (timePolicy.timeBonus.targetElapsedTicks as number)
  ) {
    timeBonusPoints = timePolicy.timeBonus.maxBonusPoints;
  }

  const finalScoreRaw = requiredPoints + optionalBonusPoints + timeBonusPoints;
  const finalScore = Math.min(Math.round(finalScoreRaw), scoreAggregationPolicy.maxScore);

  return {
    status: allRequiredCompleted ? 'completed' : 'failed',
    score: {
      requiredPoints: Math.round(requiredPoints),
      optionalBonusPoints: Math.round(optionalBonusPoints),
      timeBonusPoints: Math.round(timeBonusPoints),
      finalScore,
      maxScore: scoreAggregationPolicy.maxScore,
    },
  };
}

export interface CreateMissionResultRecordInput extends AggregateMissionResultInput {
  readonly resultId: MissionResultId;
  readonly missionId: MissionId;
  readonly sessionId: MissionSessionId;
  readonly failureReasonCode?: FailureReasonCode;
}

/** Convenience wrapper combining `aggregateMissionResult` with record identity fields. */
export function createMissionResultRecord(
  input: CreateMissionResultRecordInput,
): MissionResultRecord {
  const { status, score } = aggregateMissionResult(input);
  return {
    resultId: input.resultId,
    missionId: input.missionId,
    sessionId: input.sessionId,
    status,
    ...(status === 'failed' && input.failureReasonCode !== undefined
      ? { failureReasonCode: input.failureReasonCode }
      : {}),
    objectiveResults: input.objectiveResults,
    score,
    elapsedTicks: input.elapsedTicks,
  };
}
