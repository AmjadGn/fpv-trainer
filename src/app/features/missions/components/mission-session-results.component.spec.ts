import { TestBed } from '@angular/core/testing';

import type { MissionResultsViewModel } from '../../../core/mission/services/mission-results.facade';
import { MissionSessionResultsComponent } from './mission-session-results.component';

function viewModel(overrides: Partial<MissionResultsViewModel> = {}): MissionResultsViewModel {
  return {
    available: true,
    missionId: 'coastal-ruins-survey',
    sessionId: 'session-1',
    missionTitle: 'Coastal Ruins Survey',
    status: 'completed',
    failureReasonCode: null,
    score: { requiredPoints: 85, optionalBonusPoints: 0, timeBonusPoints: 15, finalScore: 100, maxScore: 100 },
    timeBonusPoints: 15,
    elapsedTicks: 1_000,
    elapsedSeconds: 8.33,
    objectives: [],
    showObjectiveBreakdown: true,
    showTimeBonus: true,
    customResultsNote: null,
    sessionOnly: true,
    persistenceStatus: 'saved',
    persistenceNote: 'Result saved',
    isNewPersonalBest: false,
    memoryOnly: false,
    ...overrides,
  };
}

describe('MissionSessionResultsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MissionSessionResultsComponent] });
  });

  it('shows saving and saved persistence status', () => {
    const fixture = TestBed.createComponent(MissionSessionResultsComponent);
    fixture.componentRef.setInput(
      'viewModel',
      viewModel({ persistenceStatus: 'saving', persistenceNote: 'Saving result…' }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toMatch(/Saving result/i);

    fixture.componentRef.setInput(
      'viewModel',
      viewModel({ persistenceStatus: 'saved', persistenceNote: 'Result saved' }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toMatch(/Result saved/i);
  });

  it('shows New Personal Best only when persistence confirms it', () => {
    const fixture = TestBed.createComponent(MissionSessionResultsComponent);
    fixture.componentRef.setInput(
      'viewModel',
      viewModel({
        isNewPersonalBest: true,
        persistenceStatus: 'saved-new-personal-best',
        persistenceNote: 'New Personal Best',
      }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="new-personal-best"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toMatch(/New Personal Best/);
  });

  it('shows memory-only and image warnings', () => {
    const fixture = TestBed.createComponent(MissionSessionResultsComponent);
    fixture.componentRef.setInput(
      'viewModel',
      viewModel({
        persistenceStatus: 'memory-only',
        persistenceNote: 'Saved for this session only — durable storage is unavailable.',
        memoryOnly: true,
      }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toMatch(/session only/i);

    fixture.componentRef.setInput(
      'viewModel',
      viewModel({
        persistenceStatus: 'saved-without-images',
        persistenceNote: 'Personal Best saved. Photo storage incomplete.',
        isNewPersonalBest: true,
      }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toMatch(/Photo storage incomplete/i);
  });

  it('emits retryRequested and returnRequested from their respective buttons', () => {
    const fixture = TestBed.createComponent(MissionSessionResultsComponent);
    fixture.componentRef.setInput('viewModel', viewModel());
    fixture.detectChanges();

    let retried = 0;
    let returned = 0;
    fixture.componentInstance.retryRequested.subscribe(() => {
      retried += 1;
    });
    fixture.componentInstance.returnRequested.subscribe(() => {
      returned += 1;
    });

    const buttons = fixture.nativeElement.querySelectorAll(
      '.results-card__actions button',
    ) as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(2);
    buttons[0]!.click();
    buttons[1]!.click();

    expect(retried).toBe(1);
    expect(returned).toBe(1);
  });

  it('shows the mapped failure reason and "Mission Failed" heading for a failed attempt', () => {
    const fixture = TestBed.createComponent(MissionSessionResultsComponent);
    fixture.componentRef.setInput(
      'viewModel',
      viewModel({
        status: 'failed',
        failureReasonCode: 'AIRCRAFT_CRASHED',
        score: null,
        persistenceStatus: 'attempt-saved',
        persistenceNote: 'Attempt saved',
      }),
    );
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toMatch(/Mission Failed/);
    expect(text).toMatch(/Aircraft crashed/);
    expect(text).toMatch(/Attempt saved/);
    expect(text).not.toMatch(/New Personal Best/);
  });

  it('shows the completed heading and score for a successful attempt', () => {
    const fixture = TestBed.createComponent(MissionSessionResultsComponent);
    fixture.componentRef.setInput('viewModel', viewModel());
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toMatch(/Mission Complete/);
    expect(text).toMatch(/100 \/ 100/);
  });
});
