import { TestBed } from '@angular/core/testing';

import {
  aggregateMissionResult,
  allocateRequiredObjectiveMaxPoints,
  scorePointsFromNormalized,
} from '@fpv/mission-domain';
import type { PhotoEvaluationResult } from '@fpv/photography-domain';
import { asElapsedTicks } from '@fpv/simulation-contracts';

import {
  COASTAL_RUINS_PHOTO_OBJECTIVES,
  COASTAL_RUINS_SCORING_POLICY,
  getCoastalRuinsSurveyMission,
} from '../../../content/locations/mediterranean-expedition-region';
import { MissionObjectiveRuntime } from './mission-objective-runtime.service';

function evaluation(
  partial: Partial<PhotoEvaluationResult> &
    Pick<PhotoEvaluationResult, 'passed' | 'normalizedScore'>,
): PhotoEvaluationResult {
  return {
    scoringPolicyVersion: '1.0.0',
    totalScore: partial.totalScore ?? Math.round(partial.normalizedScore * 120),
    maxScore: partial.maxScore ?? 120,
    hardFailureReasons: partial.hardFailureReasons ?? [],
    feedbackCodes: partial.feedbackCodes ?? [],
    components: partial.components ?? [],
    ...partial,
  };
}

describe('MissionObjectiveRuntime', () => {
  let runtime: MissionObjectiveRuntime;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MissionObjectiveRuntime] });
    runtime = TestBed.inject(MissionObjectiveRuntime);
  });

  function beginCoastal(): void {
    const mission = getCoastalRuinsSurveyMission();
    const photographyObjectives = new Map(
      COASTAL_RUINS_PHOTO_OBJECTIVES.map((objective) => [
        String(objective.objectiveId),
        objective,
      ]),
    );
    const result = runtime.beginSession({
      mission,
      photographyObjectives,
      scoringPolicy: COASTAL_RUINS_SCORING_POLICY,
      sessionId: 'session-test-1',
    });
    expect(result.ok).toBe(true);
  }

  it('requires an authored objectiveScoreAllocation', () => {
    const mission = getCoastalRuinsSurveyMission();
    const withoutAllocation = {
      ...mission,
      scoreAggregationPolicy: {
        ...mission.scoreAggregationPolicy,
        objectiveScoreAllocation: undefined,
      },
    };
    const photographyObjectives = new Map(
      COASTAL_RUINS_PHOTO_OBJECTIVES.map((objective) => [
        String(objective.objectiveId),
        objective,
      ]),
    );
    const result = runtime.beginSession({
      mission: withoutAllocation,
      photographyObjectives,
      scoringPolicy: COASTAL_RUINS_SCORING_POLICY,
      sessionId: 'session-test-1',
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostic.code).toBe('MISSION_CONTENT_INVALID');
  });

  it('numbers attempts: first=1, failed increments, accepted freezes, next objective resets to 1', () => {
    beginCoastal();
    const first = runtime.getActivePhotographyObjective();
    expect(first?.attemptNumber).toBe(1);

    const failed = evaluation({
      passed: false,
      normalizedScore: 0,
      hardFailureReasons: ['SUBJECT_NOT_VISIBLE'],
      feedbackCodes: ['SUBJECT_NOT_VISIBLE'],
    });

    runtime.recordFailedAttempt(failed, {
      missionObjectiveId: first!.missionObjectiveId,
      attemptNumber: 1,
      capturedAtTick: 10,
      evidenceRef: 'session-test-1:photo-coastal-arch-01:1',
    });
    expect(runtime.getActivePhotographyObjective()?.attemptNumber).toBe(2);

    const passed = evaluation({ passed: true, normalizedScore: 1 });
    const result = runtime.createObjectiveResult(
      first!.missionObjectiveId,
      passed,
      'session-test-1:photo-coastal-arch-01:2',
    );
    const accepted = runtime.acceptObjective(result, passed, {
      missionObjectiveId: first!.missionObjectiveId,
      attemptNumber: 2,
      capturedAtTick: 20,
      evidenceRef: 'session-test-1:photo-coastal-arch-01:2',
    });
    expect(accepted.ok).toBe(true);
    expect(runtime.attemptCountsSnapshot().get(String(first!.missionObjectiveId))).toBe(2);

    const next = runtime.getActivePhotographyObjective();
    expect(next?.attemptNumber).toBe(1);
    expect(next?.photographyObjectiveId).not.toBe(first!.photographyObjectiveId);
  });

  it('maps three perfect Coastal Ruins captures to 29+28+28 and 100 with time bonus', () => {
    beginCoastal();
    const mission = getCoastalRuinsSurveyMission();
    const allocation = mission.scoreAggregationPolicy.objectiveScoreAllocation!;
    const budgets = allocateRequiredObjectiveMaxPoints({
      allocation,
      maxScore: 100,
      reservedTimeBonusPoints: 15,
    });
    expect(budgets.ok).toBe(true);
    if (!budgets.ok) {
      return;
    }

    const perfect = evaluation({ passed: true, normalizedScore: 1 });
    const scores: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      runtime.onAuthoritativeTick(1_000 + i);
      const active = runtime.getActivePhotographyObjective();
      expect(active).not.toBeNull();
      const result = runtime.createObjectiveResult(
        active!.missionObjectiveId,
        perfect,
        `evidence-${i}`,
      );
      scores.push(result.scorePoints);
      expect(result.maxPoints).toBe(
        budgets.maxPointsByObjectiveId.get(String(active!.missionObjectiveId)),
      );
      const accepted = runtime.acceptObjective(result, perfect, {
        missionObjectiveId: active!.missionObjectiveId,
        attemptNumber: 1,
        capturedAtTick: i + 1,
        evidenceRef: `evidence-${i}`,
      });
      expect(accepted.ok).toBe(true);
    }
    expect(scores).toEqual([29, 28, 28]);

    const record = runtime.completeMissionAndPrepareResults();
    expect(record).not.toBeNull();
    expect(record!.score.requiredPoints).toBe(85);
    expect(record!.score.timeBonusPoints).toBe(15);
    expect(record!.score.finalScore).toBe(100);
  });

  it('does not clamp three perfect captures without time bonus to 100', () => {
    beginCoastal();
    const perfect = evaluation({ passed: true, normalizedScore: 1 });
    for (let i = 0; i < 3; i += 1) {
      // Stamp elapsed beyond the time-bonus target before the final completion.
      runtime.onAuthoritativeTick(40_000 + i);
      const active = runtime.getActivePhotographyObjective()!;
      const result = runtime.createObjectiveResult(
        active.missionObjectiveId,
        perfect,
        `evidence-${i}`,
      );
      runtime.acceptObjective(result, perfect, {
        missionObjectiveId: active.missionObjectiveId,
        attemptNumber: 1,
        capturedAtTick: i + 1,
        evidenceRef: `evidence-${i}`,
      });
    }
    const record = runtime.completeMissionAndPrepareResults();
    expect(record!.score.timeBonusPoints).toBe(0);
    expect(record!.score.finalScore).toBe(85);
  });

  it('fails a mission only once and resets attempts on full retry', () => {
    beginCoastal();
    expect(runtime.failMission('AIRCRAFT_CRASHED')).toBe(true);
    expect(runtime.failMission('AIRCRAFT_CRASHED')).toBe(false);
    expect(runtime.presentation().failureReasonCode).toBe('AIRCRAFT_CRASHED');

    const retried = runtime.retryFullMission();
    expect(retried.ok).toBe(true);
    expect(runtime.getActivePhotographyObjective()?.attemptNumber).toBe(1);
    expect(runtime.presentation().failureReasonCode).toBeNull();
  });

  it('scorePointsFromNormalized is used for partial captures', () => {
    expect(scorePointsFromNormalized(0.5, 29)).toBe(15);
    const aggregated = aggregateMissionResult({
      objectiveResults: [
        {
          objectiveId: getCoastalRuinsSurveyMission().grouping.requiredObjectiveIds[0]!,
          status: 'completed',
          scorePoints: 15,
          maxPoints: 29,
        },
      ],
      requiredObjectiveIds: getCoastalRuinsSurveyMission().grouping.requiredObjectiveIds,
      scoreAggregationPolicy: getCoastalRuinsSurveyMission().scoreAggregationPolicy,
      timePolicy: getCoastalRuinsSurveyMission().timePolicy,
      elapsedTicks: asElapsedTicks(1),
    });
    expect(aggregated.status).toBe('failed');
    expect(aggregated.score.finalScore).toBe(15);
  });
});
