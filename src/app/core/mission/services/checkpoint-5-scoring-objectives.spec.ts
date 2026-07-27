import { TestBed } from '@angular/core/testing';

import type { PhotoEvaluationResult } from '@fpv/photography-domain';

import {
  COASTAL_RUINS_PHOTO_OBJECTIVES,
  COASTAL_RUINS_SCORING_POLICY,
  getCoastalRuinsSurveyMission,
} from '../../../content/locations/mediterranean-expedition-region';
import {
  MAX_RETAINED_FAILED_ATTEMPTS_PER_OBJECTIVE,
  MissionObjectiveRuntime,
} from './mission-objective-runtime.service';
import { MissionResultsFacade } from './mission-results.facade';

/**
 * Checkpoint 5 — objective sequencing, scoring, and session-only results.
 *
 * Complements `mission-objective-runtime.spec.ts` (attempt numbering and
 * authored point allocation) with progression, idempotence, time-bonus, and
 * results-breakdown behaviour.
 */

const SESSION_ID = 'session-scoring';
const MISSION = getCoastalRuinsSurveyMission();
const TIME_BONUS = MISSION.timePolicy.timeBonus!;
const OBJECTIVE_IDS = MISSION.grouping.requiredObjectiveIds.map((id) => String(id));

function evaluationOf(
  overrides: Partial<PhotoEvaluationResult> = {},
): PhotoEvaluationResult {
  const normalizedScore = overrides.normalizedScore ?? 1;
  return {
    scoringPolicyVersion: '1.0.0',
    passed: overrides.passed ?? true,
    totalScore: overrides.totalScore ?? Math.round(normalizedScore * 120),
    maxScore: overrides.maxScore ?? 120,
    normalizedScore,
    components: overrides.components ?? [
      { componentId: 'visibility', rawScore: 15, maxScore: 15 },
      { componentId: 'framing', rawScore: 12, maxScore: 15 },
      { componentId: 'stability', rawScore: 10, maxScore: 10 },
    ],
    hardFailureReasons: overrides.hardFailureReasons ?? [],
    feedbackCodes: overrides.feedbackCodes ?? ['EXCELLENT_FRAMING'],
    ...overrides,
  };
}

interface Harness {
  readonly runtime: MissionObjectiveRuntime;
  readonly results: MissionResultsFacade;
}

function setup(): Harness {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [MissionObjectiveRuntime, MissionResultsFacade],
  });
  const runtime = TestBed.inject(MissionObjectiveRuntime);
  const started = runtime.beginSession({
    mission: MISSION,
    photographyObjectives: new Map(
      COASTAL_RUINS_PHOTO_OBJECTIVES.map((objective) => [
        String(objective.objectiveId),
        objective,
      ]),
    ),
    scoringPolicy: COASTAL_RUINS_SCORING_POLICY,
    sessionId: SESSION_ID,
  });
  expect(started.ok).toBe(true);
  return { runtime, results: TestBed.inject(MissionResultsFacade) };
}

function accept(
  runtime: MissionObjectiveRuntime,
  evaluation: PhotoEvaluationResult = evaluationOf(),
): { missionCompleted: boolean; objectiveId: string } {
  const active = runtime.getActivePhotographyObjective();
  expect(active).not.toBeNull();
  const evidenceRef = `${SESSION_ID}:${active!.photographyObjectiveId}:${active!.attemptNumber}`;
  const result = runtime.createObjectiveResult(
    active!.missionObjectiveId,
    evaluation,
    evidenceRef,
  );
  const accepted = runtime.acceptObjective(result, evaluation, {
    missionObjectiveId: active!.missionObjectiveId,
    attemptNumber: active!.attemptNumber,
    capturedAtTick: 10,
    evidenceRef,
  });
  expect(accepted.ok).toBe(true);
  return {
    missionCompleted: accepted.ok ? accepted.missionCompleted : false,
    objectiveId: String(active!.missionObjectiveId),
  };
}

function fail(runtime: MissionObjectiveRuntime, tick = 5): void {
  const active = runtime.getActivePhotographyObjective();
  expect(active).not.toBeNull();
  runtime.recordFailedAttempt(
    evaluationOf({
      passed: false,
      normalizedScore: 0.2,
      hardFailureReasons: ['stability: Aircraft is not sufficiently stable'],
      feedbackCodes: ['HOLD_STEADY'],
    }),
    {
      missionObjectiveId: active!.missionObjectiveId,
      attemptNumber: active!.attemptNumber,
      capturedAtTick: tick,
      evidenceRef: `${SESSION_ID}:${active!.photographyObjectiveId}:${active!.attemptNumber}`,
    },
  );
}

describe('Checkpoint 5 — objective scoring and progression', () => {
  it('keeps a failed attempt on the same objective and retains bounded feedback history', () => {
    const { runtime } = setup();
    const first = runtime.getActivePhotographyObjective()!;

    for (let attempt = 0; attempt < MAX_RETAINED_FAILED_ATTEMPTS_PER_OBJECTIVE + 3; attempt += 1) {
      fail(runtime, attempt);
    }

    const active = runtime.getActivePhotographyObjective();
    expect(active?.missionObjectiveId).toBe(first.missionObjectiveId);
    expect(active?.attemptNumber).toBe(MAX_RETAINED_FAILED_ATTEMPTS_PER_OBJECTIVE + 4);
    expect(runtime.isObjectiveCompleted(first.missionObjectiveId)).toBe(false);

    const history = runtime.failedAttemptsFor(first.missionObjectiveId);
    expect(history).toHaveLength(MAX_RETAINED_FAILED_ATTEMPTS_PER_OBJECTIVE);
    expect(history.at(-1)?.feedbackCodes).toEqual(['HOLD_STEADY']);
    expect(runtime.presentation().lastAttemptPassed).toBe(false);
    expect(runtime.presentation().completedObjectiveCount).toBe(0);
  });

  it('advances through the authored objective order as captures are accepted', () => {
    const { runtime } = setup();

    expect(runtime.getActivePhotographyObjective()?.photographyObjectiveId).toBe(
      'photo-coastal-arch-01',
    );
    const first = accept(runtime);
    expect(first.missionCompleted).toBe(false);
    expect(runtime.getActivePhotographyObjective()?.photographyObjectiveId).toBe(
      'photo-coastal-lookout-01',
    );

    const second = accept(runtime);
    expect(second.missionCompleted).toBe(false);
    expect(runtime.getActivePhotographyObjective()?.photographyObjectiveId).toBe(
      'photo-coastal-cliff-01',
    );
    expect(runtime.presentation().completedObjectiveCount).toBe(2);
  });

  it('completes the mission on the third accepted capture', () => {
    const { runtime } = setup();
    accept(runtime);
    accept(runtime);
    const third = accept(runtime);

    expect(third.missionCompleted).toBe(true);
    expect(runtime.missionState()).toBe('missionCompleted');
    expect(runtime.getActivePhotographyObjective()).toBeNull();
    expect(runtime.presentation().completedObjectiveCount).toBe(3);
    for (const objectiveId of OBJECTIVE_IDS) {
      expect(runtime.isObjectiveCompleted(objectiveId)).toBe(true);
    }
  });

  it('refuses to accept the same objective twice', () => {
    const { runtime } = setup();
    const active = runtime.getActivePhotographyObjective()!;
    const evaluation = evaluationOf();
    const result = runtime.createObjectiveResult(
      active.missionObjectiveId,
      evaluation,
      'evidence-1',
    );

    expect(
      runtime.acceptObjective(result, evaluation, {
        missionObjectiveId: active.missionObjectiveId,
        attemptNumber: 1,
        capturedAtTick: 10,
        evidenceRef: 'evidence-1',
      }).ok,
    ).toBe(true);

    const second = runtime.acceptObjective(result, evaluation, {
      missionObjectiveId: active.missionObjectiveId,
      attemptNumber: 2,
      capturedAtTick: 20,
      evidenceRef: 'evidence-2',
    });

    expect(second.ok).toBe(false);
    if (second.ok) {
      return;
    }
    expect(second.diagnostic.code).toBe('PHOTO_OBJECTIVE_ALREADY_COMPLETED');
    expect(runtime.acceptedEvaluationFor(active.missionObjectiveId)).toBe(evaluation);
  });

  it('refuses to accept an objective once the mission has failed', () => {
    const { runtime } = setup();
    const active = runtime.getActivePhotographyObjective()!;
    const evaluation = evaluationOf();
    const result = runtime.createObjectiveResult(
      active.missionObjectiveId,
      evaluation,
      'evidence-1',
    );
    expect(runtime.failMission('OUT_OF_BOUNDS')).toBe(true);

    const accepted = runtime.acceptObjective(result, evaluation, {
      missionObjectiveId: active.missionObjectiveId,
      attemptNumber: 1,
      capturedAtTick: 10,
      evidenceRef: 'evidence-1',
    });

    expect(accepted.ok).toBe(false);
    if (accepted.ok) {
      return;
    }
    expect(accepted.diagnostic.code).toBe('PHOTO_CAPTURE_NOT_ACTIVE');
  });

  it('preserves the per-objective component breakdown in session-only results', () => {
    const { runtime, results } = setup();
    const evaluations = [
      evaluationOf({ normalizedScore: 1, feedbackCodes: ['EXCELLENT_FRAMING'] }),
      evaluationOf({ normalizedScore: 0.75, feedbackCodes: ['CENTER_SUBJECT'] }),
      evaluationOf({ normalizedScore: 0.5, feedbackCodes: ['MOVE_CLOSER'] }),
    ];
    for (const evaluation of evaluations) {
      accept(runtime, evaluation);
    }

    const record = runtime.completeMissionAndPrepareResults()!;
    results.setResult({
      record,
      mission: MISSION,
      evaluations: runtime.acceptedEvaluationsSnapshot(),
      attemptCounts: runtime.attemptCountsSnapshot(),
      fixedStepSeconds: 1 / 120,
    });

    const viewModel = results.viewModel();
    expect(viewModel.available).toBe(true);
    expect(viewModel.sessionOnly).toBe(true);
    expect(viewModel.objectives).toHaveLength(3);
    viewModel.objectives.forEach((entry, index) => {
      expect(entry.status).toBe('completed');
      expect(entry.normalizedScore).toBe(evaluations[index]!.normalizedScore);
      expect(entry.photoTotalScore).toBe(evaluations[index]!.totalScore);
      expect(entry.photoMaxScore).toBe(120);
      expect(entry.feedbackCodes).toEqual(evaluations[index]!.feedbackCodes);
      expect(entry.attemptCount).toBe(1);
      expect(entry.evidenceRef).not.toBeNull();
      expect(entry.scorePoints).toBeLessThanOrEqual(entry.maxPoints);
    });
    expect(viewModel.showObjectiveBreakdown).toBe(true);
  });

  it('reports incomplete objectives with zero points when the mission fails', () => {
    const { runtime } = setup();
    accept(runtime);
    expect(runtime.failMission('AIRCRAFT_CRASHED')).toBe(true);

    const record = runtime.completeMissionAndPrepareResults()!;
    expect(record.status).toBe('failed');
    expect(record.failureReasonCode).toBe('AIRCRAFT_CRASHED');
    expect(record.objectiveResults.map((result) => result.status)).toEqual([
      'completed',
      'incomplete',
      'incomplete',
    ]);
    expect(
      record.objectiveResults
        .filter((result) => result.status === 'incomplete')
        .every((result) => result.scorePoints === 0),
    ).toBe(true);
    expect(record.score.timeBonusPoints).toBe(0);
  });

  it('aggregates the same attempt into a byte-identical, idempotent record', () => {
    const runOnce = (): string => {
      const { runtime } = setup();
      runtime.onAuthoritativeTick(1_234);
      accept(runtime, evaluationOf({ normalizedScore: 1 }));
      accept(runtime, evaluationOf({ normalizedScore: 0.9 }));
      accept(runtime, evaluationOf({ normalizedScore: 0.8 }));
      const first = runtime.completeMissionAndPrepareResults()!;
      const second = runtime.completeMissionAndPrepareResults()!;
      expect(second).toBe(first);
      return JSON.stringify(first);
    };

    const baseline = runOnce();
    for (let i = 0; i < 5; i += 1) {
      expect(runOnce()).toBe(baseline);
    }
  });

  it('awards the time bonus from authoritative ticks, inclusive of the target', () => {
    const target = TIME_BONUS.targetElapsedTicks as unknown as number;

    const onTarget = setup();
    onTarget.runtime.onAuthoritativeTick(target);
    accept(onTarget.runtime);
    accept(onTarget.runtime);
    accept(onTarget.runtime);
    const onTargetRecord = onTarget.runtime.completeMissionAndPrepareResults()!;
    expect(onTargetRecord.elapsedTicks as unknown as number).toBe(target);
    expect(onTargetRecord.score.timeBonusPoints).toBe(TIME_BONUS.maxBonusPoints);
    expect(onTargetRecord.score.finalScore).toBe(100);

    const overTarget = setup();
    overTarget.runtime.onAuthoritativeTick(target + 1);
    accept(overTarget.runtime);
    accept(overTarget.runtime);
    accept(overTarget.runtime);
    const overRecord = overTarget.runtime.completeMissionAndPrepareResults()!;
    expect(overRecord.score.timeBonusPoints).toBe(0);
    expect(overRecord.score.finalScore).toBe(85);
  });

  it('derives results elapsed seconds from ticks and the authoritative step rate', () => {
    const { runtime, results } = setup();
    runtime.onAuthoritativeTick(7_200);
    accept(runtime);
    accept(runtime);
    accept(runtime);
    const record = runtime.completeMissionAndPrepareResults()!;
    results.setResult({
      record,
      mission: MISSION,
      evaluations: runtime.acceptedEvaluationsSnapshot(),
      attemptCounts: runtime.attemptCountsSnapshot(),
      fixedStepSeconds: 1 / 120,
    });

    expect(results.viewModel().elapsedTicks).toBe(7_200);
    expect(results.viewModel().elapsedSeconds).toBeCloseTo(60, 10);
  });

  it('never times a mission out: no hard limit and no timeout failure policy', () => {
    const { runtime } = setup();
    expect(MISSION.timePolicy.hardLimitTicks).toBeNull();
    expect(MISSION.failurePolicy.timeout.enabled).toBe(false);

    runtime.onAuthoritativeTick(5_000_000);
    expect(runtime.isActive()).toBe(true);
    expect(runtime.missionState()).toBe('active');
    expect(runtime.getActivePhotographyObjective()).not.toBeNull();
    expect(runtime.elapsedTicks()).toBe(5_000_000);

    accept(runtime);
    accept(runtime);
    accept(runtime);
    const record = runtime.completeMissionAndPrepareResults()!;
    expect(record.status).toBe('completed');
    expect(record.score.timeBonusPoints).toBe(0);
  });

  it('ignores non-monotonic or invalid tick stamps', () => {
    const { runtime } = setup();
    runtime.onAuthoritativeTick(1_000);
    runtime.onAuthoritativeTick(Number.NaN);
    runtime.onAuthoritativeTick(-5);
    expect(runtime.elapsedTicks()).toBe(1_000);
  });
});
