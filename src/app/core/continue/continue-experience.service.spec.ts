import { TestBed } from '@angular/core/testing';
import { ContinueExperienceService } from './continue-experience.service';
import { CONTINUE_STORAGE_KEY } from './continue-state.model';

describe('ContinueExperienceService', () => {
  beforeEach(() => {
    localStorage.removeItem(CONTINUE_STORAGE_KEY);
    TestBed.configureTestingModule({});
  });

  it('stores and dismisses continue prompts', () => {
    const service = TestBed.inject(ContinueExperienceService);
    service.remember({
      kind: 'free-flight',
      label: 'Continue Free Flight with AeroGuard 2',
      aircraftId: 'aeroguard-2',
      environmentId: 'alpine-training-valley',
    });
    expect(service.hasContinue()).toBe(true);
    expect(service.prompt()?.kind).toBe('free-flight');
    service.dismiss();
    expect(service.hasContinue()).toBe(false);
  });
});
