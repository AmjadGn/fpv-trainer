import { evaluateStepTrigger } from './guidance-trigger.service';
import { GuidanceEngineService } from './guidance-engine.service';
import { TestBed } from '@angular/core/testing';

describe('GuidanceEngineService', () => {
  it('does not start in competitive mode', () => {
    TestBed.configureTestingModule({});
    const engine = TestBed.inject(GuidanceEngineService);
    expect(engine.start('first-flight-v1', { competitive: true })).toBe(false);
    expect(engine.isActive()).toBe(false);
  });

  it('starts first-flight script and advances on throttle', () => {
    TestBed.configureTestingModule({});
    const engine = TestBed.inject(GuidanceEngineService);
    expect(engine.start('first-flight-v1')).toBe(true);
    engine.advance(); // leave manual arm step
    engine.tick({
      elapsedSec: 1,
      throttle: 0.4,
      altitude: 0,
      yawDelta: 0,
      pitchDelta: 0,
      rollDelta: 0,
    });
    expect(engine.progress()?.completedStepIds.length ?? 0).toBeGreaterThan(0);
  });
});

describe('evaluateStepTrigger', () => {
  it('matches altitude threshold', () => {
    expect(
      evaluateStepTrigger(
        {
          id: 'a',
          title: 't',
          body: 'b',
          trigger: { type: 'altitude-reached', value: 2 },
          actions: [],
        },
        {
          elapsedSec: 0,
          throttle: 0,
          altitude: 2.5,
          yawDelta: 0,
          pitchDelta: 0,
          rollDelta: 0,
        },
      ),
    ).toBe(true);
  });
});
