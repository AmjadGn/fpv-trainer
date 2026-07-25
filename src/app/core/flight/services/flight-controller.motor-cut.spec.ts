import { TestBed } from '@angular/core/testing';

import { FLIGHT_CONFIG } from '../config/flight-config';
import type { FlightInput } from '../models/flight-input.model';
import { FlightControllerService } from './flight-controller.service';

const ZERO_INPUT: FlightInput = {
  throttle: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
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

  it('accelerates downward immediately after disarm while airborne', () => {
    service.arm(0);
    step(1);
    service.disarm();

    const altitudeAtCut = service.position().y;
    const velocityAtCut = service.velocity().y;

    step(1);

    expect(service.armed()).toBe(false);
    expect(service.velocity().y).toBeLessThan(velocityAtCut);
    expect(service.position().y).toBeLessThan(altitudeAtCut);
  });

  it('ignores throttle and attitude inputs after motor cut', () => {
    service.arm(0);
    step(30, { throttle: 0.8, yaw: 0.2, pitch: 0.2, roll: -0.2 });
    service.disarm();

    const orientationAtCut = { ...service.orientation() };
    step(30, { throttle: 1, yaw: 1, pitch: 1, roll: 1 });

    expect(service.armed()).toBe(false);
    expect(service.position().y).toBeLessThan(10);
    expect(service.orientation()).toEqual(orientationAtCut);
  });

  it('continues falling deterministically until ground resolution', () => {
    service.arm(0);
    step(1);
    service.disarm();
    step(600);

    expect(service.position().y).toBeGreaterThanOrEqual(FLIGHT_CONFIG.groundEpsilon);
    expect(service.altitude()).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(service.position().y)).toBe(true);
    expect(Number.isFinite(service.velocity().y)).toBe(true);
  });
});
