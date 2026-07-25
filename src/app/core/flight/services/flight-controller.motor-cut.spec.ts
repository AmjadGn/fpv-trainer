import { TestBed } from '@angular/core/testing';

import { flightProfileToAppliedConfig } from '../../aircraft/adapters/flight-profile.adapter';
import { AIRCRAFT_CATALOG } from '../../aircraft/data/aircraft-catalog';
import { FLIGHT_CONFIG } from '../config/flight-config';
import type { FlightInput } from '../models/flight-input.model';
import { FlightControllerService } from './flight-controller.service';

const ZERO_INPUT: FlightInput = {
  throttle: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
};

const MAX_STICK_INPUT: FlightInput = {
  throttle: 1,
  yaw: 1,
  pitch: 1,
  roll: 1,
};

describe('FlightControllerService motor cut', () => {
  let service: FlightControllerService;
  const dt = FLIGHT_CONFIG.physicsStep;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FlightControllerService] });
    service = TestBed.inject(FlightControllerService);
    service.reset({ position: { x: 0, y: 10, z: 0 } });
  });

  function step(times: number, input: FlightInput = ZERO_INPUT): void {
    for (let index = 0; index < times; index += 1) {
      service.update(input, dt);
    }
  }

  function snapshot(): {
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  } {
    return {
      position: { ...service.position() },
      velocity: { ...service.velocity() },
      orientation: { ...service.orientation() },
    };
  }

  it('accelerates downward immediately after disarm while airborne', () => {
    service.arm(0);
    step(1);
    service.disarm();

    const velocityAtCut = service.velocity().y;
    const gravityDelta = FLIGHT_CONFIG.gravity * dt;

    step(1);

    expect(service.armed()).toBe(false);
    // Vertical acceleration must be downward immediately (may still rise briefly).
    expect(service.velocity().y).toBeLessThan(velocityAtCut);
    expect(service.velocity().y).toBeCloseTo(
      velocityAtCut - gravityDelta,
      1,
    );
  });

  it('continues falling after motor cut (altitude decreases, vy negative)', () => {
    service.reset({ position: { x: 0, y: 50, z: 0 } });
    service.arm(0);
    service.disarm();

    const altitudeAtCut = service.position().y;
    // 0.5s — still airborne from 50m with brick-drop speeds.
    step(60);

    expect(service.armed()).toBe(false);
    expect(service.position().y).toBeLessThan(altitudeAtCut);
    expect(service.position().y).toBeGreaterThan(FLIGHT_CONFIG.groundEpsilon + 1);
    expect(service.velocity().y).toBeLessThan(0);
  });

  it('falls near free-fall after motor cut (simulator ballistic, not soft float)', () => {
    service.reset({ position: { x: 0, y: 40, z: 0 } });
    service.arm(0);
    service.disarm();

    const coastSeconds = 0.5;
    const steps = Math.round(coastSeconds / dt);
    step(steps);

    const freeFallSpeed = FLIGHT_CONFIG.gravity * coastSeconds;
    // Brick drop: first half-second must track free-fall closely.
    expect(-service.velocity().y).toBeGreaterThan(freeFallSpeed * 0.95);
    expect(-service.velocity().y).toBeLessThan(freeFallSpeed * 1.02);
    expect(service.position().y).toBeLessThan(
      40 - 0.5 * freeFallSpeed * coastSeconds * 0.9,
    );
  });

  it('does not soft-cap fall speed near armed maxVelocity (~17–20 m/s)', () => {
    service.reset({ position: { x: 0, y: 200, z: 0 } });
    service.arm(0);
    service.disarm();

    // ~2.5 s of freefall → well past the old ~17 m/s “speed limit” feel.
    step(Math.round(2.5 / dt));

    expect(-service.velocity().y).toBeGreaterThan(22);
    expect(-service.velocity().y).toBeGreaterThan(FLIGHT_CONFIG.maxVelocity * 0.7);
    expect(service.position().y).toBeGreaterThan(FLIGHT_CONFIG.groundEpsilon + 10);
  });

  it('accounts for upward momentum: climb then cut still gets downward acceleration', () => {
    service.arm(0);
    step(90, { throttle: 1, yaw: 0, pitch: 0, roll: 0 });
    expect(service.velocity().y).toBeGreaterThan(0);

    service.disarm();
    const velocityAtCut = service.velocity().y;
    const altitudeAtCut = service.position().y;

    step(1);

    expect(service.velocity().y).toBeLessThan(velocityAtCut);
    // May still rise for a short time due to residual upward momentum.
    expect(service.position().y).toBeGreaterThan(altitudeAtCut - 0.01);

    step(240);
    expect(service.position().y).toBeLessThan(altitudeAtCut);
    expect(service.velocity().y).toBeLessThan(0);
  });

  it('ignores throttle and attitude inputs after motor cut', () => {
    service.arm(0);
    step(30, { throttle: 0.8, yaw: 0, pitch: 0, roll: 0 });
    service.disarm();

    const angAtCut = { ...service.angularVelocity() };
    const flightTimeAtCut = service.flightTime();

    step(30, MAX_STICK_INPUT);

    expect(service.armed()).toBe(false);
    expect(service.flightTime()).toBe(flightTimeAtCut);
    expect(service.position().y).toBeLessThan(10);

    // Stick must not drive rates toward targets — residual rates damp only.
    expect(Math.abs(service.angularVelocity().pitch)).toBeLessThanOrEqual(
      Math.abs(angAtCut.pitch) + 1e-6,
    );
    expect(Math.abs(service.angularVelocity().roll)).toBeLessThanOrEqual(
      Math.abs(angAtCut.roll) + 1e-6,
    );
    expect(Math.abs(service.angularVelocity().yaw)).toBeLessThanOrEqual(
      Math.abs(angAtCut.yaw) + 1e-6,
    );

    // No upward thrust recovery from max throttle while disarmed.
    expect(service.velocity().y).toBeLessThan(0);
  });

  it('does not freeze staging/reset drones that were never armed airborne', () => {
    service.reset({ position: { x: 0, y: 1, z: 0 } });
    const start = snapshot();
    step(120, MAX_STICK_INPUT);
    expect(service.position()).toEqual(start.position);
    expect(service.velocity()).toEqual(start.velocity);
    expect(service.armed()).toBe(false);
  });

  it('continues falling deterministically until ground resolution', () => {
    service.arm(0);
    step(1);
    service.disarm();
    step(600);

    expect(service.position().y).toBeGreaterThanOrEqual(
      FLIGHT_CONFIG.groundEpsilon,
    );
    expect(service.altitude()).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(service.position().y)).toBe(true);
    expect(Number.isFinite(service.velocity().y)).toBe(true);
    expect(Number.isNaN(service.position().x)).toBe(false);
    expect(Number.isNaN(service.orientation().w)).toBe(false);
  });

  it('motor-cut scenario is deterministic across identical runs', () => {
    const run = () => {
      service.reset({ position: { x: 0, y: 12, z: 0 } });
      service.arm(0);
      step(40, { throttle: 0.85, yaw: 0.1, pitch: -0.15, roll: 0.2 });
      service.disarm();
      step(90, MAX_STICK_INPUT);
      return snapshot();
    };

    const a = run();
    const b = run();
    expect(b).toEqual(a);
  });

  it('shared motor-cut gravity response holds for every factory aircraft', () => {
    expect(AIRCRAFT_CATALOG.length).toBeGreaterThan(0);

    for (const def of AIRCRAFT_CATALOG) {
      service.reset({ position: { x: 0, y: 15, z: 0 } });
      service.applyAircraftConfig(flightProfileToAppliedConfig(def));
      service.arm(0);
      step(20, { throttle: 0.9, yaw: 0, pitch: 0, roll: 0 });
      service.disarm();

      const velocityAtCut = service.velocity().y;
      const altitudeAtCut = service.position().y;
      const flightTimeAtCut = service.flightTime();

      step(1, MAX_STICK_INPUT);
      expect(service.velocity().y).toBeLessThan(velocityAtCut);
      expect(service.flightTime()).toBe(flightTimeAtCut);

      step(200, MAX_STICK_INPUT);
      expect(service.position().y).toBeLessThan(altitudeAtCut);
      expect(service.velocity().y).toBeLessThan(0);
      expect(Number.isFinite(service.position().y)).toBe(true);
    }
  });
});
