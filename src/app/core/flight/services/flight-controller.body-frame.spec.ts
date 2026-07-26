import { TestBed } from '@angular/core/testing';

import {
  defaultAppliedFlightConfig,
  flightProfileToAppliedConfig,
} from '../../aircraft/adapters/flight-profile.adapter';
import { AIRCRAFT_CATALOG } from '../../aircraft/data/aircraft-catalog';
import { FLIGHT_CONFIG } from '../config/flight-config';
import type { FlightInput } from '../models/flight-input.model';
import type { Quat, Vec3 } from '../models/flight-state.model';
import {
  bodyForwardWorld,
  bodyRightWorld,
  bodyUpWorld,
  headingYawRad,
  worldRotationAxisBetween,
} from '../utils/quat-math';
import { FlightControllerService } from './flight-controller.service';

/**
 * Layer 2 — FlightControllerService body-frame controls (no Rapier).
 *
 * Analytic expectations:
 * - +pitch at identity → horizontal thrust toward world −Z (nose / course).
 * - +yaw turns nose toward +X; headingYawRad → +π/2.
 * - After yaw +90°, +pitch thrusts along +X (new nose), not spawn −Z.
 * Expected axes come from rotation matrices / heading definition — not from
 * copying the controller's rotate helper into the assertion.
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

  function shortestAngleError(target: number, current: number): number {
    let err = target - current;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    return err;
  }

  function yawToHeading(targetYawRad: number, tolerance = 0.08): void {
    const maxSteps = 1200;
    for (let i = 0; i < maxSteps; i++) {
      const err = shortestAngleError(
        targetYawRad,
        headingYawRad(service.orientation()),
      );
      if (
        Math.abs(err) <= tolerance &&
        Math.abs(service.angularVelocity().yaw) < 0.35
      ) {
        step(25, input({ throttle: 0.55 }));
        return;
      }
      const yawStick = Math.max(-1, Math.min(1, err * 2.2));
      step(1, input({ throttle: 0.55, yaw: yawStick }));
    }
    throw new Error(
      `Failed to reach yaw ${targetYawRad}; got ${headingYawRad(service.orientation())}`,
    );
  }

  function pitchBurst(): void {
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

  function instantThrustDir(): Vec3 {
    return bodyUpWorld(service.orientation());
  }

  // ── Thrust direction (pre-velocity) ─────────────────────────────────────

  it('thrust: identity local up is world +Y', () => {
    service.arm(0);
    const up = instantThrustDir();
    expect(up.x).toBeCloseTo(0, 5);
    expect(up.y).toBeCloseTo(1, 5);
    expect(up.z).toBeCloseTo(0, 5);
  });

  it('thrust: +pitch from identity gains world −Z (nose / course forward)', () => {
    service.arm(0);
    step(40, input({ throttle: 0.55, pitch: 1 }));
    const up = instantThrustDir();
    expect(up.z).toBeLessThan(-0.25);
    expect(Math.abs(up.z)).toBeGreaterThan(Math.abs(up.x) * 3);
  });

  it('thrust: after yaw +90° then +pitch, horizontal thrust along +X', () => {
    service.arm(0);
    yawToHeading(Math.PI / 2);
    step(30, input({ throttle: 0.55 }));
    step(40, input({ throttle: 0.55, pitch: 1 }));
    const up = instantThrustDir();
    expect(up.x).toBeGreaterThan(0.25);
    expect(Math.abs(up.x)).toBeGreaterThan(Math.abs(up.z) * 2);
  });

  it('thrust: after yaw 180° then +pitch, horizontal thrust along +Z (opposite spawn −Z)', () => {
    service.arm(0);
    yawToHeading(Math.PI);
    step(30, input({ throttle: 0.55 }));
    step(40, input({ throttle: 0.55, pitch: 1 }));
    const up = instantThrustDir();
    expect(up.z).toBeGreaterThan(0.25);
    expect(Math.abs(up.z)).toBeGreaterThan(Math.abs(up.x) * 2);
  });

  it('thrust: after yaw +90° then +roll, thrust leans along current body-right', () => {
    service.arm(0);
    yawToHeading(Math.PI / 2);
    step(30, input({ throttle: 0.55 }));
    const rightBefore = bodyRightWorld(service.orientation());
    step(40, input({ throttle: 0.55, roll: 1 }));
    const up = instantThrustDir();
    const lean = { x: up.x, y: 0, z: up.z };
    const mag = Math.hypot(lean.x, lean.z);
    expect(mag).toBeGreaterThan(0.2);
    const aligned =
      (lean.x * rightBefore.x + lean.z * rightBefore.z) / mag;
    expect(aligned).toBeGreaterThan(0.7);
  });

  // ── Control-axis finite difference ──────────────────────────────────────

  it('axis: after yaw +90°, pitch delta rotates about body-right', () => {
    service.arm(0);
    yawToHeading(Math.PI / 2);
    step(40, input({ throttle: 0.55 }));
    const q0: Quat = { ...service.orientation() };
    const right = bodyRightWorld(q0);
    step(20, input({ throttle: 0.55, pitch: 1 }));
    const axis = worldRotationAxisBetween(q0, service.orientation());
    expect(axis).not.toBeNull();
    const aligned = Math.abs(
      axis!.x * right.x + axis!.y * right.y + axis!.z * right.z,
    );
    expect(aligned).toBeGreaterThan(0.95);
  });

  it('axis: after yaw +90°, roll delta rotates about body-forward', () => {
    service.arm(0);
    yawToHeading(Math.PI / 2);
    step(40, input({ throttle: 0.55 }));
    const q0: Quat = { ...service.orientation() };
    const forward = bodyForwardWorld(q0);
    step(20, input({ throttle: 0.55, roll: 1 }));
    const axis = worldRotationAxisBetween(q0, service.orientation());
    expect(axis).not.toBeNull();
    const aligned = Math.abs(
      axis!.x * forward.x + axis!.y * forward.y + axis!.z * forward.z,
    );
    expect(aligned).toBeGreaterThan(0.95);
  });

  // ── Velocity / heading scenarios ────────────────────────────────────────

  it('TEST1: zero-yaw +pitch moves along world −Z', () => {
    service.arm(0);
    pitchBurst();
    const v = horiz();
    const mag = Math.hypot(v.x, v.z);
    expect(mag).toBeGreaterThan(1.5);
    expect(v.z).toBeLessThan(0);
    expect(Math.abs(v.z)).toBeGreaterThan(Math.abs(v.x) * 3);
  });

  it('TEST2: after yaw ~90° right, +pitch tracks new heading (+X)', () => {
    service.arm(0);
    yawToHeading(Math.PI / 2);
    expect(headingYawRad(service.orientation())).toBeGreaterThan(
      Math.PI / 2 - 0.15,
    );
    expect(headingYawRad(service.orientation())).toBeLessThan(
      Math.PI / 2 + 0.15,
    );

    step(30, input({ throttle: 0.65 }));
    const before = horiz();
    pitchBurst();
    const after = horiz();
    const delta = { x: after.x - before.x, z: after.z - before.z };
    expect(Math.hypot(delta.x, delta.z)).toBeGreaterThan(1.2);
    expect(delta.x).toBeGreaterThan(0);
    expect(Math.abs(delta.x)).toBeGreaterThan(Math.abs(delta.z) * 2);
    expect(Math.abs(delta.z)).toBeLessThan(Math.abs(delta.x) * 0.55);
  });

  it('TEST3: after yaw ~180°, +pitch is opposite spawn (−Z → +Z)', () => {
    service.arm(0);
    yawToHeading(Math.PI);
    step(30, input({ throttle: 0.65 }));
    const before = horiz();
    pitchBurst();
    const after = horiz();
    const delta = { x: after.x - before.x, z: after.z - before.z };
    expect(Math.hypot(delta.x, delta.z)).toBeGreaterThan(1.2);
    expect(delta.z).toBeGreaterThan(0);
    expect(Math.abs(delta.z)).toBeGreaterThan(Math.abs(delta.x) * 2);
  });

  it('TEST4: after yaw ~90°, +roll tilts about current body forward', () => {
    service.arm(0);
    yawToHeading(Math.PI / 2);
    step(30, input({ throttle: 0.65 }));

    const fwdBefore = bodyForwardWorld(service.orientation());
    const before = horiz();
    rollBurst();
    const after = horiz();
    const delta = { x: after.x - before.x, z: after.z - before.z };
    const right = bodyRightWorld(service.orientation());
    const fwdAfter = bodyForwardWorld(service.orientation());

    const forwardDot =
      fwdBefore.x * fwdAfter.x +
      fwdBefore.y * fwdAfter.y +
      fwdBefore.z * fwdAfter.z;
    expect(forwardDot).toBeGreaterThan(0.92);

    const mag = Math.hypot(delta.x, delta.z);
    expect(mag).toBeGreaterThan(0.8);
    const deltaDotRight =
      (delta.x * right.x + delta.z * right.z) / mag;
    expect(Math.abs(deltaDotRight)).toBeGreaterThan(0.55);
    // After +90° yaw right, body right ≈ +Z; lateral motion dominates over ±X.
    expect(Math.abs(delta.z)).toBeGreaterThan(Math.abs(delta.x) * 1.5);
  });

  it('TEST5: yaw-then-pitch matches identity pitch rotated by R_y(−π/2)', () => {
    // Analytic: R_y(−π/2) maps (x,y,z) → (−z, y, x). Spawn −Z pitch → +X.
    service.arm(0);
    step(25, input({ throttle: 0.7 }));
    const beforeA = horiz();
    step(70, input({ throttle: 0.95, pitch: 1 }));
    const scenarioA = {
      x: service.velocity().x - beforeA.x,
      z: service.velocity().z - beforeA.z,
    };

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

    const expected = { x: -scenarioA.z, z: scenarioA.x };
    const err = Math.hypot(scenarioB.x - expected.x, scenarioB.z - expected.z);
    const scale = Math.hypot(scenarioA.x, scenarioA.z);
    expect(scale).toBeGreaterThan(1);
    expect(err / scale).toBeLessThan(0.35);
  });

  it('TEST5b: 180° yaw-then-pitch matches R_y(π) of identity pitch', () => {
    service.arm(0);
    step(25, input({ throttle: 0.7 }));
    const beforeA = horiz();
    step(70, input({ throttle: 0.95, pitch: 1 }));
    const scenarioA = {
      x: service.velocity().x - beforeA.x,
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

    const expected = { x: -scenarioA.x, z: -scenarioA.z };
    const err = Math.hypot(scenarioB.x - expected.x, scenarioB.z - expected.z);
    const scale = Math.hypot(scenarioA.x, scenarioA.z);
    expect(err / scale).toBeLessThan(0.35);
  });

  it('TEST6: body-frame pitch-after-yaw holds for every factory aircraft', () => {
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

  it('TEST6b: compiled-style applied config shares body-frame controller', () => {
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
      step(25, input({ throttle: 0.7 }));
      step(profile === 'beginner' ? 110 : 70, input({ throttle: 0.95, pitch: 1 }));
      const delta = {
        x: service.velocity().x - before.x,
        z: service.velocity().z - before.z,
      };
      expect(Math.abs(delta.x)).toBeGreaterThan(Math.abs(delta.z) * 1.3);
    }
  });

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

  it('TEST8: mixed rates keep orientation unit-length and state finite', () => {
    service.arm(0);
    step(600, input({ throttle: 0.85, pitch: 0.7, yaw: -0.55, roll: 0.4 }));
    const q = service.orientation();
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 5);
    expect([q.x, q.y, q.z, q.w].every(Number.isFinite)).toBe(true);
    const p = service.position();
    const v = service.velocity();
    expect([p.x, p.y, p.z, v.x, v.y, v.z].every(Number.isFinite)).toBe(true);
  });

  it('local forward/right/up track orientation after yaw right 90°', () => {
    service.arm(0);
    yawToHeading(Math.PI / 2);
    const f = bodyForwardWorld(service.orientation());
    const r = bodyRightWorld(service.orientation());
    const u = bodyUpWorld(service.orientation());
    // Analytic R_y(−π/2): forward → +X, right → +Z, up → +Y
    expect(f.x).toBeGreaterThan(0.9);
    expect(Math.abs(f.y)).toBeLessThan(0.1);
    expect(r.z).toBeGreaterThan(0.9);
    expect(u.y).toBeGreaterThan(0.95);
  });

  it('getFrameDiagnostics reports consistent body axes', () => {
    service.arm(0);
    yawToHeading(Math.PI / 2);
    const d = service.getFrameDiagnostics();
    expect(d.bodyForwardWorld.x).toBeGreaterThan(0.9);
    expect(d.commandedPitchAxisWorld.z).toBeGreaterThan(0.9);
    expect(d.thrustDirectionWorld.y).toBeGreaterThan(0.9);
    expect(d.headingYawDeg).toBeGreaterThan(80);
    expect(d.headingYawDeg).toBeLessThan(100);
  });
});
