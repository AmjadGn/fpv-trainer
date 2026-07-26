import { asMissionResultId, asMissionSessionId, createMissionResultRecord } from '@fpv/mission-domain';
import type { PhotoEvaluationResult } from '@fpv/photography-domain';
import { asElapsedTicks } from '@fpv/simulation-contracts';

import { getCoastalRuinsSurveyMission } from '../../../content/locations/mediterranean-expedition-region/missions/coastal-ruins-survey';
import { MissionResultsFacade } from './mission-results.facade';

/** `MissionResultsFacade` has no injected dependencies; instantiate directly. */

const MISSION = getCoastalRuinsSurveyMission();
const REQUIRED_IDS =
  MISSION.grouping.mode === 'sequential' ? MISSION.grouping.requiredObjectiveIds : [];

function evaluation(overrides: Partial<PhotoEvaluationResult> = {}): PhotoEvaluationResult {
  return {
    scoringPolicyVersion: '1.0.0',
    passed: true,
    totalScore: 120,
    maxScore: 120,
    normalizedScore: 1,
    components: [],
    hardFailureReasons: [],
    feedbackCodes: [],
    ...overrides,
  };
}

function buildResultInput() {
  const objectiveResults = REQUIRED_IDS.map((objectiveId) => ({
    objectiveId,
    status: 'completed' as const,
    scorePoints: 28,
    maxPoints: 29,
    photographyEvaluationRef: `evidence-${String(objectiveId)}`,
  }));
  const record = createMissionResultRecord({
    resultId: asMissionResultId('session-1:result'),
    missionId: MISSION.missionId,
    sessionId: asMissionSessionId('session-1'),
    objectiveResults,
    requiredObjectiveIds: REQUIRED_IDS,
    scoreAggregationPolicy: MISSION.scoreAggregationPolicy,
    timePolicy: MISSION.timePolicy,
    elapsedTicks: asElapsedTicks(1_000),
  });
  const evaluations = new Map(
    REQUIRED_IDS.map((objectiveId) => [String(objectiveId), evaluation()]),
  );
  const attemptCounts = new Map(REQUIRED_IDS.map((objectiveId) => [String(objectiveId), 1]));
  return { record, evaluations, attemptCounts };
}

describe('MissionResultsFacade', () => {
  it('starts unavailable and session-only', () => {
    const facade = new MissionResultsFacade();
    expect(facade.viewModel().available).toBe(false);
    expect(facade.viewModel().sessionOnly).toBe(true);
  });

  it('populates the view model from a mission result record', () => {
    const facade = new MissionResultsFacade();
    const { record, evaluations, attemptCounts } = buildResultInput();
    facade.setResult({ record, mission: MISSION, evaluations, attemptCounts });

    const vm = facade.viewModel();
    expect(vm.available).toBe(true);
    expect(vm.sessionOnly).toBe(true);
    expect(vm.missionId).toBe(String(MISSION.missionId));
    expect(vm.objectives).toHaveLength(REQUIRED_IDS.length);
    expect(vm.objectives.every((o) => o.presentationImageUrl === null)).toBe(true);
  });

  it('attaches a presentation image and revokes the previous URL when replaced', () => {
    const facade = new MissionResultsFacade();
    const { record, evaluations, attemptCounts } = buildResultInput();
    facade.setResult({ record, mission: MISSION, evaluations, attemptCounts });

    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const objectiveId = String(REQUIRED_IDS[0]);

    facade.attachPresentationImage(objectiveId, 'blob:first');
    expect(facade.presentationImageUrl(objectiveId)).toBe('blob:first');
    expect(revokeSpy).not.toHaveBeenCalled();

    facade.attachPresentationImage(objectiveId, 'blob:second');
    expect(revokeSpy).toHaveBeenCalledWith('blob:first');
    expect(facade.presentationImageUrl(objectiveId)).toBe('blob:second');

    const entry = facade.viewModel().objectives.find((o) => o.objectiveId === objectiveId);
    expect(entry?.presentationImageUrl).toBe('blob:second');

    revokeSpy.mockRestore();
  });

  it('clear() revokes every retained URL and resets to the empty view model', () => {
    const facade = new MissionResultsFacade();
    const { record, evaluations, attemptCounts } = buildResultInput();
    facade.setResult({ record, mission: MISSION, evaluations, attemptCounts });

    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    facade.attachPresentationImage(String(REQUIRED_IDS[0]), 'blob:a');
    facade.attachPresentationImage(String(REQUIRED_IDS[1]), 'blob:b');

    facade.clear();

    expect(revokeSpy).toHaveBeenCalledWith('blob:a');
    expect(revokeSpy).toHaveBeenCalledWith('blob:b');
    expect(facade.viewModel().available).toBe(false);
    expect(facade.presentationImageUrls()).toEqual([]);

    revokeSpy.mockRestore();
  });
});
