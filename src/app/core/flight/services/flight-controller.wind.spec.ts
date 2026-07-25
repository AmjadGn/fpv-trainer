import { TestBed } from '@angular/core/testing';

import { FLIGHT_CONFIG } from '../../flight/config/flight-config';
import { FlightControllerService } from '../../flight/services/flight-controller.service';

describe('FlightControllerService wind integration', () => {
  let service: FlightControllerService;
  const dt = FLIGHT_CONFIG.physicsStep;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FlightControllerService] });
    service = TestBed.inject(FlightControllerService);
    service.reset();
  });

  function hoverInput() {
    return { throttle: 0.5, yaw: 0, pitch: 0, roll: 0 };
  }

  it('wind disabled preserves zero-wind hover drift equivalence', () => {
    service.clearWind();
    service.arm(0);
    const start = { ...service.position() };
    for (let i = 0; i < 120; i++) {
      service.update(hoverInput(), dt);
    }
    const noWind = { ...service.position() };

    service.reset({ position: start, orientation: { x: 0, y: 0, z: 0, w: 1 } });
    service.setWindSample({ velocity: { x: 0, y: 0, z: 0 } });
    service.arm(0);
    for (let i = 0; i < 120; i++) {
      service.update(hoverInput(), dt);
    }
    const zeroWind = service.position();
    expect(zeroWind.x).toBeCloseTo(noWind.x, 8);
    expect(zeroWind.y).toBeCloseTo(noWind.y, 8);
    expect(zeroWind.z).toBeCloseTo(noWind.z, 8);
  });

  it('steady lateral wind causes horizontal drift', () => {
    service.arm(0);
    service.setWindSample({ velocity: { x: 5, y: 0, z: 0 } });
    for (let i = 0; i < 240; i++) {
      service.update(hoverInput(), dt);
    }
    expect(service.position().x).toBeGreaterThan(0.5);
  });

  it('extreme safe wind values stay finite', () => {
    service.arm(0);
    service.setWindSample({ velocity: { x: 12, y: 1.5, z: -12 }, turbulence: 2 });
    service.setWindTorqueScale(0.35);
    for (let i = 0; i < 300; i++) {
      service.update(
        { throttle: 0.6, yaw: 0.1, pitch: -0.1, roll: 0.05 },
        dt,
      );
    }
    const p = service.position();
    const v = service.velocity();
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(v.x)).toBe(true);
    expect(Number.isFinite(service.orientation().w)).toBe(true);
  });
});
