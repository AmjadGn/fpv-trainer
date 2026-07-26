import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import {
  asMissionId,
  asMissionResultId,
  asMissionSessionId,
  asObjectiveId,
} from '@fpv/mission-domain';
import { asElapsedTicks } from '@fpv/simulation-contracts';

import { getCoastalRuinsSurveyMission } from '../../../content/locations/mediterranean-expedition-region';
import { MissionResultsFacade } from './mission-results.facade';

describe('MissionResultsFacade', () => {
  let facade: MissionResultsFacade;
  let revokeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [MissionResultsFacade] });
    facade = TestBed.inject(MissionResultsFacade);
  });

  afterEach(() => {
    revokeSpy.mockRestore();
  });

  it('exposes session-only results without persistence fields', () => {
    const mission = getCoastalRuinsSurveyMission();
    facade.setResult({
      record: {
        resultId: asMissionResultId('r1'),
        missionId: asMissionId(String(mission.missionId)),
        sessionId: asMissionSessionId('s1'),
        status: 'completed',
        objectiveResults: [
          {
            objectiveId: asObjectiveId('obj-photo-arch'),
            status: 'completed',
            scorePoints: 29,
            maxPoints: 29,
          },
        ],
        score: {
          requiredPoints: 85,
          optionalBonusPoints: 0,
          timeBonusPoints: 15,
          finalScore: 100,
          maxScore: 100,
        },
        elapsedTicks: asElapsedTicks(1_200),
      },
      mission,
      evaluations: new Map(),
      attemptCounts: new Map([['obj-photo-arch', 1]]),
      fixedStepSeconds: 1 / 60,
    });

    const vm = facade.viewModel();
    expect(vm.available).toBe(true);
    expect(vm.sessionOnly).toBe(true);
    expect(vm.elapsedSeconds).toBe(20);
    expect(vm.score?.finalScore).toBe(100);
    expect(vm).not.toHaveProperty('bestScore');
    expect(vm).not.toHaveProperty('saved');
  });

  it('revokes previous presentation URLs on replace and clear', () => {
    facade.attachPresentationImage('obj-a', 'blob:first');
    facade.attachPresentationImage('obj-a', 'blob:second');
    expect(revokeSpy).toHaveBeenCalledWith('blob:first');
    expect(facade.presentationImageUrl('obj-a')).toBe('blob:second');

    facade.clear();
    expect(revokeSpy).toHaveBeenCalledWith('blob:second');
    expect(facade.available()).toBe(false);
    expect(facade.presentationImageUrl('obj-a')).toBeNull();
  });
});
