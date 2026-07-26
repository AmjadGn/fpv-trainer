import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { MissionResultsViewModel } from '../../../core/mission/services/mission-results.facade';
import { MissionSessionResultsComponent } from './mission-session-results.component';

const COMPLETED_VM: MissionResultsViewModel = {
  available: true,
  missionId: 'coastal-ruins-survey',
  sessionId: 's1',
  missionTitle: 'Coastal Ruins Survey',
  status: 'completed',
  failureReasonCode: null,
  score: {
    requiredPoints: 85,
    optionalBonusPoints: 0,
    timeBonusPoints: 15,
    finalScore: 100,
    maxScore: 100,
  },
  timeBonusPoints: 15,
  elapsedTicks: 1200,
  elapsedSeconds: 20,
  objectives: [
    {
      objectiveId: 'obj-photo-arch',
      displayName: 'Photograph the stone sea arch',
      status: 'completed',
      scorePoints: 29,
      maxPoints: 29,
      evidenceRef: null,
      normalizedScore: 1,
      photoTotalScore: 120,
      photoMaxScore: 120,
      feedbackCodes: [],
      attemptCount: 1,
      presentationImageUrl: null,
    },
  ],
  showObjectiveBreakdown: true,
  showTimeBonus: true,
  customResultsNote: 'Results are session-only.',
  sessionOnly: true,
};

describe('MissionSessionResultsComponent', () => {
  let fixture: ComponentFixture<MissionSessionResultsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MissionSessionResultsComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(MissionSessionResultsComponent);
    fixture.componentRef.setInput('viewModel', COMPLETED_VM);
    fixture.detectChanges();
  });

  it('shows session-only language and score totals', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Mission Complete');
    expect(text).toContain('100 / 100');
    expect(text).toContain('session only');
    expect(text).not.toContain('personal best');
    expect(text).not.toContain('leaderboard');
  });

  it('emits retry and return actions', () => {
    let retry = false;
    let ret = false;
    fixture.componentInstance.retryRequested.subscribe(() => {
      retry = true;
    });
    fixture.componentInstance.returnRequested.subscribe(() => {
      ret = true;
    });
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    buttons[0]!.click();
    buttons[1]!.click();
    expect(retry).toBe(true);
    expect(ret).toBe(true);
  });
});
