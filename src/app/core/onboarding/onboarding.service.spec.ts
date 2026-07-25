import { TestBed } from '@angular/core/testing';
import { OnboardingService } from './onboarding.service';
import { ONBOARDING_STORAGE_KEY } from './onboarding.models';

describe('OnboardingService', () => {
  beforeEach(() => {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    TestBed.configureTestingModule({});
  });

  it('starts, advances, and completes for a guest', () => {
    const service = TestBed.inject(OnboardingService);
    expect(service.needsOnboarding()).toBe(true);
    service.start();
    service.setExperienceLevel('first-time');
    service.setControlMethod('keyboard');
    service.setAircraft('aeroguard-2');
    service.complete();
    expect(service.needsOnboarding()).toBe(false);
    expect(service.snapshot().completed).toBe(true);
  });

  it('skips and can restart', () => {
    const service = TestBed.inject(OnboardingService);
    service.skip();
    expect(service.needsOnboarding()).toBe(false);
    service.restart();
    expect(service.needsOnboarding()).toBe(true);
    expect(service.currentStep()).toBe('welcome');
  });

  it('persists across service recreation', () => {
    const service = TestBed.inject(OnboardingService);
    service.start();
    service.setControlMethod('gamepad');
    service.goToStep('aircraft');
    const again = TestBed.inject(OnboardingService);
    expect(again.currentStep()).toBe('aircraft');
    expect(again.controlMethod()).toBe('gamepad');
  });
});
