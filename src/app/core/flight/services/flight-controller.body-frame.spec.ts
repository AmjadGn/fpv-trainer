import { TestBed } from '@angular/core/testing';

import {
  defaultAppliedFlightConfig,
  flightProfileToAppliedConfig,
} from '../../aircraft/adapters/flight-profile.adapter';
import { AIRCRAFT_CATALOG } from '../../aircraft/data/aircraft-catalog';
import { FLIGHT_CONFIG } from '../config/flight-config';
import type { FlightInput } from '../models/flight-input.model';
import type { Quat, Vec3 } from '../models/flight-state.model';
import { FlightControllerService } from './flight-controller.service';

/**
 * Body-frame / coordinate-frame regression suite.
 *
 * Convention (flight-state.model.ts): X right, Y up, Z backward;
 * drone forward = local −Z. Positive pitch about local +X produces horizontal
 * thrust primarily along world +Z from the identity heading (measured below).
 */

const ZERO: FlightInput = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };

describe('FlightControllerService body-frame controls', () => {
  let service: FlightControllerService;
  const dt = FLIGHT_CONFIG.physicsStep;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FlightControllerService] });
    service = TestBed.inject(FlightControllerService);
    service.setRateProfile('acro');
    service.reset({ position: { x: 0, y: 8, z: 0 } });
  });

  function input(partial: Partial<FlightInput> = {}): FlightInput {
    return { ...ZERO, ...partial };
  }

  function step(times: number, flightInput: FlightInput): void {
    for (let i = 0; i < times; i++) {
      service.update(flightInput, dt);
    }
  }

  function rotateVecByQuat(vx: number, vy: number, vz: number, q: Quat): Vec3 {
    const tx = 2 * (q.y * vz - q.z * vy);
    const ty = 2 * (q.z * vx - q.x * vz);
    const tz = 2 * (q.x * vy - q.y * vx);
    return {
      x: vx + q.w * tx + (q.y * tz - q.z * ty),
      y: vy + q.w * ty + (q.z * tx - q.x * tz),
      z: vz + q.w * tz + (q.x * ty - q.y * tx),
    };
  }

  function forwardWorld(q: Quat = service.orientation()): Vec3 {
    return rotateVecByQuat(0, 0, -1, q);
  }

  function rightWorld(q: Quat = service.orientation()): Vec3 {
    return rotateVecByQuat(1, 0, 0, q);
  }

  function upWorld(q: Quat = service.orientation()): Vec3 {
    return rotateVecByQuat(0, 1, 0, q);
  }

  function headingYawRad(q: Quat = service.orientation()): number {
    const f = forwardWorld(q);
    // 0 at spawn (−Z); positive after yaw-right (forward → −X ⇒ +π/2).
    return Math.atan2(-f.x, -f.z);
  }

  function shortestAngleError(target: number, current: number): number {
    let err = target - current;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    return err;
  }

  function yawToHeading(targetYawRad: number, tolerance = 0.08): void {
    const maxSteps = 1200;
    for (let i = 0; i < maxSteps; i++) {
      const err = shortestAngleError(targetYawRad, headingYawRad());
      if (Math.abs(err) <= tolerance && Math.abs(service.angularVelocity().yaw) < 0.35) {
        step(25, input({ throttle: 0.55 }));
        return;
      }
      const yawStick = Math.max(-1, Math.min(1, err * 2.2));
      step(1, input({ throttle: 0.55, yaw: yawStick }));
    }
    throw new Error(
      `Failed to reach yaw ${targetYawRad}; got ${headingYawRad()}`,
    );
  }

  function pitchBurst(): void {
    // Clear residual rates, then pitch with enough throttle for horizontal accel.
    step(25, input({ throttle: 0.7 }));
    step(70, input({ throttle: 0.95, pitch: 1 }));
  }

  function rollBurst(): void {
    step(25, input({ throttle: 0.7 }));
    step(55, input({ throttle: 0.95, roll: 1 }));
  }

  function horiz(v: Vec3 = service.velocity()): { x: number; z: number } {
    return { x: v.x, z: v.z };
  }

  function rotateYaw90World(v: Vec3): Vec3 {
    // R_y(+π/2): (x,y,z) → (z, y, −x)
    return { x: v.z, y: v.y, z: -v.x };
  }

  function rotateYaw180World(v: Vec3): Vec3 {
    return { x: -v.x, y: v.y, z: -v.z };
  }

  // ── TEST 1 — zero-yaw baseline ──────────────────────────────────────────

  it('TEST1: zero-yaw pitch forward moves along documented spawn-axis sign', () => {
    service.arm(0);
    pitchBurst();

    const v = horiz();
    const mag = Math.hypot(v.x, v.z);
    expect(mag).toBeGreaterThan(1.5);
    // Measured convention: +pitch from identity → dominant world +Z.
    expect(v.z).toBeGreaterThan(0);
    expect(Math.abs(v.z)).toBeGreaterThan(Math.abs(v.x) * 3);
  });

  // ── TEST 2 — yaw 90° then pitch ─────────────────────────────────────────

  it('TEST2: after yaw ~90°, pitch forward tracks new heading (not spawn +Z)', () => {
    service.arm(0);
    yawToHeading(Math.PI / 2);

    const heading = headingYawRad();
    expect(heading).toBeGreaterThan(Math.PI / 2 - 0.15);
    expect(heading).toBeLessThan(Math.PI / 2 + 0.15);

    // Kill residual rates before the pitch probe.
    step(30, input({ throttle: 0.65 }));
    const before = horiz();
    pitchBurst();
    const after = horiz();
    const delta = { x: after.x - before.x, z: after.z - before.z };
    const mag = Math.hypot(delta.x, delta.z);
    expect(mag).toBeGreaterThan(1.2);

    // Body-frame: +90° yaw then +pitch → dominant +X (spawn pitch's +Z rotated).
    expect(delta.x).toBeGreaterThan(0);
    expect(Math.abs(delta.x)).toBeGreaterThan(Math.abs(delta.z) * 2);
    // Must not remain primarily along original world forward (+Z).
    expect(Math.abs(delta.z)).toBeLessThan(Math.abs(delta.x) * 0.55);
  });

  // ── TEST 3 — yaw 180° then pitch ────────────────────────────────────────

  it('TEST3: after yaw ~180°, pitch forward is opposite spawn pitch axis', () => {
    service.arm(0);
    yawToHeading(Math.PI);

    step(30, input({ throttle: 0.65 }));
    const before = horiz();
    pitchBurst();
    const after = horiz();
    const delta = { x: after.x - before.x, z: after.z - before.z };

    expect(Math.hypot(delta.x, delta.z)).toBeGreaterThan(1.2);
    // Opposite of identity baseline (+Z) → dominant −Z.
    expect(delta.z).toBeLessThan(0);
    expect(Math.abs(delta.z)).toBeGreaterThan(Math.abs(delta.x) * 2);
  });

  // ── TEST 4 — yaw then roll ──────────────────────────────────────────────

  it('TEST4: after yaw ~90°, roll right tilts about current body forward', () => {
    service.arm(0);
    yawToHeading(Math.PI / 2);
    step(30, input({ throttle: 0.65 }));

    const fwdBefore = forwardWorld();
    const before = horiz();
    rollBurst();
    const after = horiz();
    const delta = { x: after.x - before.x, z: after.z - before.z };
    const up = upWorld();
    const right = rightWorld();

    // Forward heading should stay roughly the same (roll about body forward).
    const fwdAfter = forwardWorld();
    const forwardDot =
      fwdBefore.x * fwdAfter.x +
      fwdBefore.y * fwdAfter.y +
      fwdBefore.z * fwdAfter.z;
    expect(forwardDot).toBeGreaterThan(0.92);

    // Horizontal thrust shift is along the current lateral axis (body ±right),
    // not the spawn-world +X right axis.
    const mag = Math.hypot(delta.x, delta.z);
    expect(mag).toBeGreaterThan(0.8);
    const deltaDotRight =
      (delta.x * right.x + delta.z * right.z) / mag;
    expect(Math.abs(deltaDotRight)).toBeGreaterThan(0.55);

    // After +90° yaw, body right ≈ −Z; lateral motion must dominate over +X.
    expect(Math.abs(delta.z)).toBeGreaterThan(Math.abs(delta.x) * 1.5);
    // Must not behave like spawn-frame roll (which would drive mostly ±X).
    expect(Math.abs(delta.x)).toBeLessThan(Math.abs(delta.z) * 0.7);
    expect(up.y).toBeLessThan(0.98);
  });

  // ── TEST 5 — control sequence equivalence ───────────────────────────────

  it('TEST5: pitch-from-heading matches yaw-then-pitch after world rotation', () => {
    // Scenario A: pitch from identity — capture horizontal delta only.
    service.arm(0);
    step(25, input({ throttle: 0.7 }));
    const beforeA = horiz();
    step(70, input({ throttle: 0.95, pitch: 1 }));
    const scenarioA = {
      x: service.velocity().x - beforeA.x,
      y: 0,
      z: service.velocity().z - beforeA.z,
    };

    // Scenario B: yaw 90° then the same pitch burst.
    service.reset({ position: { x: 0, y: 8, z: 0 } });
    service.setRateProfile('acro');
    service.arm(0);
    yawToHeading(Math.PI / 2);
    step(30, input({ throttle: 0.65 }));
    step(25, input({ throttle: 0.7 }));
    const beforeB = horiz();
    step(70, input({ throttle: 0.95, pitch: 1 }));
    const scenarioB = {
      x: service.velocity().x - beforeB.x,
      z: service.velocity().z - beforeB.z,
    };

    const expected = rotateYaw90World(scenarioA);
    const err = Math.hypot(scenarioB.x - expected.x, scenarioB.z - expected.z);
    const scale = Math.hypot(scenarioA.x, scenarioA.z);
    expect(scale).toBeGreaterThan(1);
    expect(err / scale).toBeLessThan(0.35);
  });

  it('TEST5b: 180° yaw-then-pitch matches rotated identity pitch', () => {
    service.arm(0);
    step(25, input({ throttle: 0.7 }));
    const beforeA = horiz();
    step(70, input({ throttle: 0.95, pitch: 1 }));
    const scenarioA = {
      x: service.velocity().x - beforeA.x,
      y: 0,
      z: service.velocity().z - beforeA.z,
    };

    service.reset({ position: { x: 0, y: 8, z: 0 } });
    service.setRateProfile('acro');
    service.arm(0);
    yawToHeading(Math.PI);
    step(30, input({ throttle: 0.65 }));
    step(25, input({ throttle: 0.7 }));
    const beforeB = horiz();
    step(70, input({ throttle: 0.95, pitch: 1 }));
    const scenarioB = {
      x: service.velocity().x - beforeB.x,
      z: service.velocity().z - beforeB.z,
    };

    const expected = rotateYaw180World(scenarioA);
    const err = Math.hypot(scenarioB.x - expected.x, scenarioB.z - expected.z);
    const scale = Math.hypot(scenarioA.x, scenarioA.z);
    expect(err / scale).toBeLessThan(0.35);
  });

  // ── TEST 6 — factory + compiled-style coverage ──────────────────────────

  it('TEST6: shared body-frame pitch-after-yaw holds for every factory aircraft', () => {
    expect(AIRCRAFT_CATALOG.length).toBeGreaterThan(0);

    for (const def of AIRCRAFT_CATALOG) {
      service.reset({ position: { x: 0, y: 8, z: 0 } });
      service.setRateProfile('acro');
      service.applyAircraftConfig(flightProfileToAppliedConfig(def));
      service.arm(0);
      yawToHeading(Math.PI / 2);
      step(30, input({ throttle: 0.65 }));
      const before = horiz();
      pitchBurst();
      const delta = {
        x: service.velocity().x - before.x,
        z: service.velocity().z - before.z,
      };
      expect(Math.hypot(delta.x, delta.z)).toBeGreaterThan(0.9);
      expect(Math.abs(delta.x)).toBeGreaterThan(Math.abs(delta.z) * 1.5);
    }
  });

  it('TEST6b: compiled-style applied config shares the same body-frame controller', () => {
    const compiled = {
      ...defaultAppliedFlightConfig(),
      aircraftId: 'user-compiled-body-frame-probe',
      physicsProfileVersion: 'compiled-test',
      mass: 0.82,
      maxThrust: 22.4,
      maxPitchRate: 7.1,
      maxRollRate: 7.1,
      maxYawRate: 5.2,
      angularResponse: 14,
    };
    service.applyAircraftConfig(compiled);
    service.arm(0);
    yawToHeading(Math.PI / 2);
    step(30, input({ throttle: 0.65 }));
    const before = horiz();
    pitchBurst();
    const delta = {
      x: service.velocity().x - before.x,
      z: service.velocity().z - before.z,
    };
    expect(service.getAppliedAircraftId()).toBe('user-compiled-body-frame-probe');
    expect(Math.abs(delta.x)).toBeGreaterThan(Math.abs(delta.z) * 1.5);
  });

  it('TEST6c: body-frame behavior holds across rate profiles', () => {
    for (const profile of ['beginner', 'normal', 'acro'] as const) {
      service.reset({ position: { x: 0, y: 8, z: 0 } });
      service.setRateProfile(profile);
      service.arm(0);
      yawToHeading(Math.PI / 2, profile === 'beginner' ? 0.12 : 0.08);
      step(35, input({ throttle: 0.65 }));
      const before = horiz();
      // Longer pitch for slower beginner rates.
      step(25, input({ throttle: 0.7 }));
      step(profile === 'beginner' ? 110 : 70, input({ throttle: 0.95, pitch: 1 }));
      const delta = {
        x: service.velocity().x - before.x,
        z: service.velocity().z - before.z,
      };
      expect(Math.abs(delta.x)).toBeGreaterThan(Math.abs(delta.z) * 1.3);
    }
  });

  // ── TEST 7 — determinism ────────────────────────────────────────────────

  it('TEST7: identical yaw-then-pitch sequences are deterministic', () => {
    const run = () => {
      service.reset({ position: { x: 0, y: 8, z: 0 } });
      service.setRateProfile('acro');
      service.arm(0);
      step(120, input({ throttle: 0.6, yaw: 1 }));
      step(40, input({ throttle: 0.7 }));
      step(80, input({ throttle: 0.9, pitch: 1 }));
      return {
        position: { ...service.position() },
        velocity: { ...service.velocity() },
        orientation: { ...service.orientation() },
        angularVelocity: { ...service.angularVelocity() },
      };
    };

    expect(run()).toEqual(run());
  });

  // ── TEST 8 — quaternion safety ──────────────────────────────────────────

  it('TEST8: mixed rates keep orientation unit-length and state finite', () => {
    service.arm(0);
    step(
      600,
      input({ throttle: 0.85, pitch: 0.7, yaw: -0.55, roll: 0.4 }),
    );

    const q = service.orientation();
    const mag = Math.hypot(q.x, q.y, q.z, q.w);
    expect(mag).toBeCloseTo(1, 5);
    expect([q.x, q.y, q.z, q.w].every(Number.isFinite)).toBe(true);

    const p = service.position();
    const v = service.velocity();
    expect([p.x, p.y, p.z, v.x, v.y, v.z].every(Number.isFinite)).toBe(true);
  });

  // ── Thrust / local axes sanity ──────────────────────────────────────────

  it('local forward/right/up track orientation after yaw', () => {
    service.arm(0);
    yawToHeading(Math.PI / 2);
    const f = forwardWorld();
    const r = rightWorld();
    const u = upWorld();

    expect(f.x).toBeLessThan(-0.9);
    expect(Math.abs(f.y)).toBeLessThan(0.1);
    expect(r.z).toBeLessThan(-0.9);
    expect(u.y).toBeGreaterThan(0.95);
  });
});
