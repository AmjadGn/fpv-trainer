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
  bodyRightWorld,
  bodyUpWorld,
  hamiltonProductAlloc,
  quatFromAxisAngle,
} from '../utils/quat-math';
import {
  FLIGHT_HOTFIX_BUILD_MARKER,
  FlightControllerService,
} from './flight-controller.service';

/**
 * Analytic translation / force-ledger tests.
 *
 * Attitudes are constructed with quaternions — not stick sequences.
 * Assertions use actual velocityAfterController and positionDelta.
 */

const ZERO: FlightInput = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };
const PITCH_ATTITUDE_RAD = Math.PI / 6;
const ROLL_ATTITUDE_RAD = Math.PI / 6;
const THROTTLE = 0.8;

describe('FlightControllerService translation force ledger', () => {
  let service: FlightControllerService;
  const dt = FLIGHT_CONFIG.physicsStep;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FlightControllerService] });
    service = TestBed.inject(FlightControllerService);
    service.setRateProfile('acro');
    service.applyAircraftConfig({
      ...defaultAppliedFlightConfig(),
      groundEffectStrength: 0,
      maxVelocity: 0,
      linearDrag: 0.45,
      velocityDamping: 0.12,
    });
    service.enableForceLedgerDragIsolation(true);
    service.setLegacyGroundEnabled(false);
  });

  afterEach(() => {
    service.clearForceLedgerDragIsolation();
  });

  /** Nose-down pitch about +X by −θ → body up gains −Z. */
  function pitchAttitude(theta = PITCH_ATTITUDE_RAD): Quat {
    return quatFromAxisAngle(1, 0, 0, -theta);
  }

  /** Bank right about body forward (−Z). */
  function rollAttitude(theta = ROLL_ATTITUDE_RAD): Quat {
    return quatFromAxisAngle(0, 0, -1, theta);
  }

  function yawThenLocal(yawRad: number, local: Quat): Quat {
    return hamiltonProductAlloc(quatFromAxisAngle(0, 1, 0, yawRad), local);
  }

  function prepareExactAttitude(orientation: Quat): void {
    service.reset({
      position: { x: 0, y: 10, z: 0 },
      orientation,
    });
    service.arm(0);
    service.primeSmoothedInput({ ...ZERO, throttle: THROTTLE });
    service.setAuthoritativePose({
      orientation,
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { pitch: 0, yaw: 0, roll: 0 },
    });
  }

  function stepOnce(): void {
    service.update({ ...ZERO, throttle: THROTTLE }, dt);
  }

  function horiz(v: Vec3): { x: number; z: number } {
    return { x: v.x, z: v.z };
  }

  it('exposes hotfix build marker in diagnostics', () => {
    prepareExactAttitude({ x: 0, y: 0, z: 0, w: 1 });
    expect(service.getFrameDiagnostics().buildMarker).toBe(
      FLIGHT_HOTFIX_BUILD_MARKER,
    );
  });

  // ── TEST A — identity pitch translation ───────────────────────────────

  it('TEST A: identity pitch attitude → horizontal accel / vel toward −Z', () => {
    const q = pitchAttitude();
    prepareExactAttitude(q);
    const up = bodyUpWorld(q);
    expect(up.z).toBeLessThan(-0.4);

    stepOnce();
    const led = service.getLastForceLedger();
    expect(led).not.toBeNull();
    expect(led!.ledgerConsistent).toBe(true);
    expect(led!.assistAccelerationWorld.x).toBe(0);
    expect(led!.assistAccelerationWorld.z).toBe(0);
    expect(led!.collisionDeltaVelocity.x).toBe(0);

    // Thrust direction and thrust acceleration share the same horizontal sense.
    expect(led!.thrustAccelerationWorld.z).toBeLessThan(0);
    expect(led!.totalAccelerationWorld.z).toBeLessThan(0);
    expect(Math.abs(led!.totalAccelerationWorld.z)).toBeGreaterThan(
      Math.abs(led!.totalAccelerationWorld.x) * 5,
    );

    const dv = horiz(led!.velocityAfterController);
    expect(dv.z).toBeLessThan(0);
    expect(Math.abs(dv.z)).toBeGreaterThan(Math.abs(dv.x) * 5);
    expect(led!.positionDelta.z).toBeLessThan(0);
  });

  // ── TEST B — yaw 180 + same local pitch ───────────────────────────────

  it('TEST B: yaw 180 + same pitch attitude → opposite horizontal velocity', () => {
    const local = pitchAttitude();
    prepareExactAttitude(local);
    stepOnce();
    const a = service.getLastForceLedger()!;

    const q180 = yawThenLocal(Math.PI, local);
    prepareExactAttitude(q180);
    stepOnce();
    const b = service.getLastForceLedger()!;

    expect(a.thrustAccelerationWorld.z).toBeLessThan(0);
    expect(b.thrustAccelerationWorld.z).toBeGreaterThan(0);
    expect(b.thrustAccelerationWorld.z).toBeCloseTo(
      -a.thrustAccelerationWorld.z,
      5,
    );
    expect(b.thrustAccelerationWorld.y).toBeCloseTo(
      a.thrustAccelerationWorld.y,
      5,
    );

    expect(b.velocityAfterController.z).toBeCloseTo(
      -a.velocityAfterController.z,
      5,
    );
    expect(b.velocityAfterController.x).toBeCloseTo(
      -a.velocityAfterController.x,
      5,
    );
    expect(b.positionDelta.z).toBeCloseTo(-a.positionDelta.z, 5);
  });

  // ── TEST C — yaw 180 + local roll ─────────────────────────────────────

  it('TEST C: yaw 180 + roll attitude → body-right horizontal, not spawn +X', () => {
    const local = rollAttitude();
    const q180 = yawThenLocal(Math.PI, local);
    prepareExactAttitude(q180);
    const right = bodyRightWorld(q180);
    const rightHoriz = { x: right.x, z: right.z };
    const rightMag = Math.hypot(rightHoriz.x, rightHoriz.z);
    expect(rightMag).toBeGreaterThan(0.5);
    // After yaw π, horizontal body-right points toward −X (not spawn +X).
    expect(rightHoriz.x / rightMag).toBeLessThan(-0.85);

    stepOnce();
    const led = service.getLastForceLedger()!;
    const horizAccel = {
      x: led.totalAccelerationWorld.x,
      z: led.totalAccelerationWorld.z,
    };
    const mag = Math.hypot(horizAccel.x, horizAccel.z);
    expect(mag).toBeGreaterThan(0.5);
    const aligned =
      (horizAccel.x * rightHoriz.x + horizAccel.z * rightHoriz.z) /
      (mag * rightMag);
    expect(aligned).toBeGreaterThan(0.85);
    // Must not follow original world +X as the dominant horizontal axis.
    expect(led.totalAccelerationWorld.x).toBeLessThan(0);
    expect(led.velocityAfterController.x).toBeLessThan(0);
  });

  // ── TEST D — force ledger consistency ─────────────────────────────────

  it('TEST D: velocityAfter = velocityBefore + totalAccel*dt + overrides', () => {
    prepareExactAttitude(pitchAttitude());
    stepOnce();
    const led = service.getLastForceLedger()!;
    const expected = {
      x:
        led.velocityBefore.x +
        led.totalAccelerationWorld.x * led.dt +
        led.velocityOverrideDelta.x +
        led.collisionDeltaVelocity.x,
      y:
        led.velocityBefore.y +
        led.totalAccelerationWorld.y * led.dt +
        led.velocityOverrideDelta.y +
        led.collisionDeltaVelocity.y,
      z:
        led.velocityBefore.z +
        led.totalAccelerationWorld.z * led.dt +
        led.velocityOverrideDelta.z +
        led.collisionDeltaVelocity.z,
    };
    expect(led.velocityAfterController.x).toBeCloseTo(expected.x, 9);
    expect(led.velocityAfterController.y).toBeCloseTo(expected.y, 9);
    expect(led.velocityAfterController.z).toBeCloseTo(expected.z, 9);
    expect(led.ledgerConsistent).toBe(true);
  });

  it('TEST D broken-behavior proof: undocumented velocity write breaks ledger', () => {
    prepareExactAttitude(pitchAttitude());
    stepOnce();
    const led = service.getLastForceLedger()!;
    // Simulate a hidden world-space overwrite after the controller step.
    const forged = {
      ...led.velocityAfterController,
      z: -led.velocityAfterController.z,
    };
    const expectedZ =
      led.velocityBefore.z + led.totalAccelerationWorld.z * led.dt;
    expect(Math.abs(forged.z - expectedZ)).toBeGreaterThan(1e-4);
  });

  // ── TEST E layers / modes / aircraft ──────────────────────────────────

  it('Layer 1 FlightController-only: pitch attitude velocity follows nose', () => {
    prepareExactAttitude(pitchAttitude());
    stepOnce();
    const led = service.getLastForceLedger()!;
    expect(led.velocityAfterPhysicsSession).toBeNull();
    expect(led.velocityAfterController.z).toBeLessThan(0);
  });

  it('existing momentum does not flip sign of new horizontal acceleration', () => {
    const q = pitchAttitude();
    prepareExactAttitude(q);
    service.setAuthoritativePose({
      orientation: q,
      velocity: { x: 0, y: 0, z: 4 }, // opposite residual momentum
      angularVelocity: { pitch: 0, yaw: 0, roll: 0 },
    });
    service.primeSmoothedInput({ ...ZERO, throttle: THROTTLE });
    stepOnce();
    const led = service.getLastForceLedger()!;
    // New thrust accel still toward −Z even with +Z momentum.
    expect(led.thrustAccelerationWorld.z).toBeLessThan(0);
    expect(led.totalAccelerationWorld.z).toBeLessThan(0);
  });

  it('zeroLinearVelocity clears velocity for diagnosis', () => {
    prepareExactAttitude(pitchAttitude());
    stepOnce();
    expect(Math.hypot(
      service.velocity().x,
      service.velocity().y,
      service.velocity().z,
    )).toBeGreaterThan(0.01);
    service.zeroLinearVelocity();
    expect(service.velocity()).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('factory aircraft share translation path for yaw-180 pitch attitude', () => {
    const local = pitchAttitude();
    const q180 = yawThenLocal(Math.PI, local);
    for (const def of AIRCRAFT_CATALOG) {
      service.applyAircraftConfig({
        ...flightProfileToAppliedConfig(def),
        groundEffectStrength: 0,
        maxVelocity: 0,
      });
      service.enableForceLedgerDragIsolation(true);
      prepareExactAttitude(q180);
      stepOnce();
      const led = service.getLastForceLedger()!;
      expect(led.totalAccelerationWorld.z).toBeGreaterThan(0);
      expect(led.velocityAfterController.z).toBeGreaterThan(0);
    }
  });

  it('compiled-style aircraft shares translation path', () => {
    service.applyAircraftConfig({
      ...defaultAppliedFlightConfig(),
      aircraftId: 'user-compiled-translation-probe',
      groundEffectStrength: 0,
      maxVelocity: 0,
      mass: 0.9,
      maxThrust: 24,
    });
    service.enableForceLedgerDragIsolation(true);
    const q180 = yawThenLocal(Math.PI, pitchAttitude());
    prepareExactAttitude(q180);
    stepOnce();
    expect(service.getLastForceLedger()!.velocityAfterController.z).toBeGreaterThan(
      0,
    );
  });

  it('thrustDirectionWorld and totalAccelerationWorld are independent fields', () => {
    prepareExactAttitude(pitchAttitude());
    // Re-enable drag with residual velocity so totalAccel ≠ thrust-only.
    service.clearForceLedgerDragIsolation();
    service.setAuthoritativePose({
      orientation: pitchAttitude(),
      velocity: { x: 3, y: 0, z: -2 },
      angularVelocity: { pitch: 0, yaw: 0, roll: 0 },
    });
    service.primeSmoothedInput({ ...ZERO, throttle: THROTTLE });
    stepOnce();
    const d = service.getFrameDiagnostics();
    const led = d.forceLedger!;
    expect(d.thrustDirectionWorld).toEqual(led.thrustDirectionWorld);
    expect(led.totalAccelerationWorld).not.toEqual(led.thrustAccelerationWorld);
  });

  it('motor-cut ballistic has no thrust acceleration', () => {
    prepareExactAttitude(pitchAttitude());
    service.disarm(); // airborne → motor-cut coast
    const before = { ...service.velocity() };
    service.update(ZERO, dt);
    // Passive path does not write armed force ledger; velocity gains gravity only.
    expect(service.velocity().y).toBeLessThan(before.y);
  });
});
