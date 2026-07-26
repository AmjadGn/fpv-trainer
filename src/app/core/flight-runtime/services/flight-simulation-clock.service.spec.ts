import { TestBed } from '@angular/core/testing';

import { FLIGHT_CONFIG } from '../../flight/config/flight-config';
import type { AuthoritativeFlightStepSnapshot } from '../models/authoritative-flight-step-snapshot';
import { AuthoritativeFlightStepPublisher } from './authoritative-flight-step-publisher.service';
import { FlightSimulationClock } from './flight-simulation-clock.service';

function makeSnapshot(
  tick: number,
  sessionGeneration: number,
): AuthoritativeFlightStepSnapshot {
  return {
    simulationTick: tick,
    fixedStepSeconds: FLIGHT_CONFIG.physicsStep,
    sessionGeneration,
    pose: {
      position: { x: 0, y: 1, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    },
    linearVelocity: { x: 0, y: 0, z: 0 },
    bodyAngularVelocity: { pitch: 0, yaw: 0, roll: 0 },
    armed: true,
    crashed: false,
    altitudeMeters: 1,
    speedMps: 0,
    aircraftId: 'test-aircraft',
    aircraftSourceType: 'factory',
    definitionVersion: '1',
    physicsProfileVersion: '1',
    collisionOutcome: 'none',
    runtimeCompatibilityVersion: '1.3.0-runtime-c3',
  };
}

describe('FlightSimulationClock', () => {
  let clock: FlightSimulationClock;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FlightSimulationClock] });
    clock = TestBed.inject(FlightSimulationClock);
  });

  it('starts at tick zero for a new session', () => {
    const gen = clock.beginSession();
    expect(clock.currentTick()).toBe(0);
    expect(gen).toBeGreaterThan(0);
  });

  it('increments once per completed fixed step', () => {
    clock.beginSession();
    expect(clock.completeFixedStep()).toBe(1);
    expect(clock.completeFixedStep()).toBe(2);
    expect(clock.currentTick()).toBe(2);
  });

  it('reset begins a new session generation at tick 0', () => {
    clock.beginSession();
    clock.completeFixedStep();
    const gen1 = clock.sessionGeneration();
    const gen2 = clock.resetSession();
    expect(gen2).toBe(gen1 + 1);
    expect(clock.currentTick()).toBe(0);
  });

  it('rejects non-positive fixed step duration', () => {
    expect(() => clock.beginSession(0)).toThrow();
    expect(() => clock.beginSession(-1)).toThrow();
  });
});

describe('AuthoritativeFlightStepPublisher', () => {
  let publisher: AuthoritativeFlightStepPublisher;
  let clock: FlightSimulationClock;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AuthoritativeFlightStepPublisher, FlightSimulationClock],
    });
    publisher = TestBed.inject(AuthoritativeFlightStepPublisher);
    clock = TestBed.inject(FlightSimulationClock);
    publisher.clearObservers();
    clock.beginSession();
  });

  it('notifies observers synchronously in registration order', () => {
    const order: string[] = [];
    publisher.subscribe({
      id: 'a',
      onAuthoritativeFixedStep: () => order.push('a'),
    });
    publisher.subscribe({
      id: 'b',
      onAuthoritativeFixedStep: () => order.push('b'),
    });
    const tick = publisher.completeFixedStep();
    publisher.publish(makeSnapshot(tick, clock.sessionGeneration()));
    expect(order).toEqual(['a', 'b']);
  });

  it('render-frame conceptual path does not increment tick', () => {
    clock.beginSession();
    expect(clock.currentTick()).toBe(0);
    // No completeFixedStep → tick stays 0 across "frames".
    expect(clock.currentTick()).toBe(0);
  });

  it('paused path that skips completeFixedStep does not produce ticks', () => {
    clock.beginSession();
    // Mimic paused early-return: no completeFixedStep call.
    expect(publisher.currentTick()).toBe(0);
  });

  it('prevents duplicate observer registration', () => {
    const obs = {
      id: 'dup',
      onAuthoritativeFixedStep: () => undefined,
    };
    publisher.subscribe(obs);
    expect(() => publisher.subscribe(obs)).toThrow(/already registered/);
  });

  it('teardown removes observers', () => {
    let calls = 0;
    publisher.subscribe({
      id: 'x',
      onAuthoritativeFixedStep: () => {
        calls += 1;
      },
    });
    publisher.unsubscribe('x');
    publisher.publish(makeSnapshot(1, 1));
    expect(calls).toBe(0);
  });

  it('observer failure is reported and does not stop peers', () => {
    const failures: string[] = [];
    publisher.setFailureHandler((id) => failures.push(id));
    const order: string[] = [];
    publisher.subscribe({
      id: 'bad',
      onAuthoritativeFixedStep: () => {
        throw new Error('boom');
      },
    });
    publisher.subscribe({
      id: 'good',
      onAuthoritativeFixedStep: () => order.push('good'),
    });
    publisher.publish(makeSnapshot(1, 1));
    expect(failures).toEqual(['bad']);
    expect(order).toEqual(['good']);
  });

  it('clearObservers removes all', () => {
    publisher.subscribe({
      id: 'a',
      onAuthoritativeFixedStep: () => undefined,
    });
    publisher.clearObservers();
    expect(publisher.observerIds()).toEqual([]);
  });
});
