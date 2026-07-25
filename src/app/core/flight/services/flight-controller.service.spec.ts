import { TestBed } from '@angular/core/testing';

import { FLIGHT_CONFIG } from '../config/flight-config';
import { FlightInput } from '../models/flight-input.model';
import { FlightControllerService } from './flight-controller.service';

describe('FlightControllerService', () => {
  let service: FlightControllerService;
  const dt = FLIGHT_CONFIG.physicsStep;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FlightControllerService],
    });
    service = TestBed.inject(FlightControllerService);
    service.reset();
  });

  function input(partial: Partial<FlightInput> = {}): FlightInput {
    return {
      throttle: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      ...partial,
    };
  }

  function step(times: number, flightInput: FlightInput): void {
    for (let i = 0; i < times; i++) {
      service.update(flightInput, dt);
    }
  }

  function quatMag(): number {
    const q = service.orientation();
    return Math.hypot(q.x, q.y, q.z, q.w);
  }

  it('reset restores initial state', () => {
    service.arm(0);
    step(30, input({ throttle: 0.8, pitch: 0.4 }));
    service.reset();

    expect(service.armed()).toBe(false);
    expect(service.crashed()).toBe(false);
    expect(service.flightTime()).toBe(0);
    expect(service.position()).toEqual(FLIGHT_CONFIG.initialPosition);
    expect(service.velocity()).toEqual({ x: 0, y: 0, z: 0 });
    expect(service.orientation()).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(service.angularVelocity()).toEqual({
      pitch: 0,
      yaw: 0,
      roll: 0,
    });
  });

  it('reset accepts a supplied position and orientation', () => {
    const position = { x: 3, y: 2, z: -4 };
    const orientation = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
    service.arm(0);
    step(20, input({ throttle: 0.7 }));
    service.reset({ position, orientation });

    expect(service.position()).toEqual(position);
    expect(service.orientation().x).toBeCloseTo(orientation.x, 8);
    expect(service.orientation().y).toBeCloseTo(orientation.y, 8);
    expect(service.orientation().z).toBeCloseTo(orientation.z, 8);
    expect(service.orientation().w).toBeCloseTo(orientation.w, 8);
    expect(service.armed()).toBe(false);
  });

  it('rate profile switching updates the active profile', () => {
    expect(service.rateProfileId()).toBe('beginner');
    expect(service.setRateProfile('acro')).toBe(true);
    expect(service.rateProfileId()).toBe('acro');
    expect(service.rateProfile().maxPitchRate).toBeGreaterThan(
      FLIGHT_CONFIG.maxPitchRate,
    );
  });

  it('disarmed throttle does nothing', () => {
    const start = { ...service.position() };
    step(120, input({ throttle: 1 }));
    expect(service.position()).toEqual(start);
    expect(service.velocity()).toEqual({ x: 0, y: 0, z: 0 });
    expect(service.armed()).toBe(false);
  });

  it('arming with safe throttle succeeds', () => {
    expect(service.arm(0.05)).toBe(true);
    expect(service.armed()).toBe(true);
    expect(service.armWarning()).toBeNull();
  });

  it('arming with high throttle is rejected', () => {
    expect(service.arm(0.5)).toBe(false);
    expect(service.armed()).toBe(false);
    expect(service.armWarning()).toBe('Lower throttle before arming');
  });

  it('thrust overcomes gravity at high throttle', () => {
    service.arm(0);
    const startY = service.position().y;
    step(180, input({ throttle: 1 }));
    expect(service.position().y).toBeGreaterThan(startY + 0.5);
    expect(service.velocity().y).toBeGreaterThan(0);
  });

  it('zero or low throttle descends when armed', () => {
    service.arm(0);
    // Climb first
    step(120, input({ throttle: 1 }));
    const peakY = service.position().y;
    expect(peakY).toBeGreaterThan(FLIGHT_CONFIG.initialPosition.y);

    step(180, input({ throttle: 0 }));
    expect(service.position().y).toBeLessThan(peakY);
    expect(service.velocity().y).toBeLessThan(0);
  });

  it('roll input changes orientation', () => {
    service.arm(0);
    step(60, input({ throttle: 0.5, roll: 1 }));
    const q = service.orientation();
    expect(Math.abs(q.x) + Math.abs(q.y) + Math.abs(q.z)).toBeGreaterThan(0.01);
    expect(Math.abs(service.angularVelocity().roll)).toBeGreaterThan(0.1);
  });

  it('pitch input changes orientation', () => {
    service.arm(0);
    step(60, input({ throttle: 0.5, pitch: 1 }));
    const q = service.orientation();
    expect(Math.abs(q.x)).toBeGreaterThan(0.01);
    expect(Math.abs(service.angularVelocity().pitch)).toBeGreaterThan(0.1);
  });

  it('yaw input changes orientation', () => {
    service.arm(0);
    step(60, input({ throttle: 0.5, yaw: 1 }));
    const q = service.orientation();
    expect(Math.abs(q.y)).toBeGreaterThan(0.01);
    expect(Math.abs(service.angularVelocity().yaw)).toBeGreaterThan(0.1);
  });

  it('quaternion remains normalized', () => {
    service.arm(0);
    step(240, input({ throttle: 0.7, roll: 0.8, pitch: -0.6, yaw: 0.4 }));
    expect(quatMag()).toBeCloseTo(1, 5);
  });

  it('linear drag reduces velocity', () => {
    service.arm(0);
    // Build horizontal velocity by pitching forward then cutting rates.
    step(40, input({ throttle: 0.85, pitch: 1 }));
    step(40, input({ throttle: 0.85, pitch: 0 }));

    const speedBefore = service.speed();
    expect(speedBefore).toBeGreaterThan(0.5);

    // Coast with zero thrust and zero rates — drag should slow us (also gravity).
    // Compare horizontal speed which drag clearly reduces.
    const horizBefore = Math.hypot(
      service.velocity().x,
      service.velocity().z,
    );
    step(180, input({ throttle: 0 }));
    const horizAfter = Math.hypot(
      service.velocity().x,
      service.velocity().z,
    );
    expect(horizAfter).toBeLessThan(horizBefore);
  });

  it('ground collision prevents negative altitude', () => {
    service.arm(0);
    step(600, input({ throttle: 0 }));
    expect(service.position().y).toBeGreaterThanOrEqual(0);
    expect(service.altitude()).toBeGreaterThanOrEqual(0);
  });

  it('hard impact marks crash', () => {
    service.setRateProfile('acro');
    service.arm(0);
    // Climb then dive with high pitch and no throttle.
    step(200, input({ throttle: 1 }));
    step(40, input({ throttle: 0, pitch: 1 }));
    step(500, input({ throttle: 0, pitch: 1 }));

    expect(service.crashed()).toBe(true);
    expect(service.armed()).toBe(false);
  });

  it('crashed drone ignores thrust', () => {
    service.setRateProfile('acro');
    service.arm(0);
    step(200, input({ throttle: 1 }));
    step(40, input({ throttle: 0, pitch: 1 }));
    step(500, input({ throttle: 0, pitch: 1 }));
    expect(service.crashed()).toBe(true);

    const pos = { ...service.position() };
    step(120, input({ throttle: 1, pitch: 1, roll: 1 }));
    expect(service.position()).toEqual(pos);
    expect(service.armed()).toBe(false);
  });

  it('reset clears crash', () => {
    service.setRateProfile('acro');
    service.arm(0);
    step(200, input({ throttle: 1 }));
    step(40, input({ throttle: 0, pitch: 1 }));
    step(500, input({ throttle: 0, pitch: 1 }));
    expect(service.crashed()).toBe(true);

    service.reset();
    expect(service.crashed()).toBe(false);
    expect(service.armed()).toBe(false);
    expect(service.position()).toEqual(FLIGHT_CONFIG.initialPosition);
  });

  it('fixed repeated updates produce deterministic results', () => {
    const run = (): {
      position: ReturnType<FlightControllerService['position']>;
      orientation: ReturnType<FlightControllerService['orientation']>;
      velocity: ReturnType<FlightControllerService['velocity']>;
    } => {
      service.reset();
      service.arm(0);
      step(100, input({ throttle: 0.72, roll: 0.3, pitch: -0.2, yaw: 0.15 }));
      return {
        position: { ...service.position() },
        orientation: { ...service.orientation() },
        velocity: { ...service.velocity() },
      };
    };

    const a = run();
    const b = run();
    expect(b.position).toEqual(a.position);
    expect(b.orientation).toEqual(a.orientation);
    expect(b.velocity).toEqual(a.velocity);
  });
});
