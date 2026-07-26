import { TestBed } from '@angular/core/testing';

import { FLIGHT_CONFIG } from '../../flight/config/flight-config';
import type { FlightInput } from '../../flight/models/flight-input.model';
import { FlightControllerService } from '../../flight/services/flight-controller.service';
import {
  bodyUpWorld,
  headingYawRad,
  quatFromAxisAngle,
} from '../../flight/utils/quat-math';
import { PhysicsSessionService } from './physics-session.service';

/**
 * Layer 3 — PhysicsSession integration / isolation.
 *
 * When the session is inactive (no Rapier), the flight controller path alone
 * must already exhibit body-frame pitch-after-yaw. Active Rapier corrections
 * must not rewrite orientation on empty contact frames.
 */

const ZERO: FlightInput = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };

describe('PhysicsSession body-frame isolation', () => {
  let flight: FlightControllerService;
  let session: PhysicsSessionService;
  const dt = FLIGHT_CONFIG.physicsStep;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FlightControllerService, PhysicsSessionService],
    });
    flight = TestBed.inject(FlightControllerService);
    session = TestBed.inject(PhysicsSessionService);
    flight.setRateProfile('acro');
    flight.reset({ position: { x: 0, y: 8, z: 0 } });
  });

  function input(partial: Partial<FlightInput> = {}): FlightInput {
    return { ...ZERO, ...partial };
  }

  function step(n: number, flightInput: FlightInput): void {
    for (let i = 0; i < n; i++) {
      flight.update(flightInput, dt);
      // Mirror flight.component: only apply corrections when session active.
      if (session.isActive()) {
        const correction = session.processFixedStep({
          position: flight.position(),
          velocity: flight.velocity(),
          orientation: flight.orientation(),
          angularVelocity: flight.angularVelocity(),
          armed: flight.armed(),
          crashed: flight.crashed(),
          timestampMs: flight.getSimulationTime() * 1000,
        });
        if (correction?.orientation) {
          flight.applyCollisionCorrection({
            position: correction.position,
            velocity: correction.velocity,
            angularVelocity: correction.angularVelocity,
            orientation: correction.orientation,
            crash: correction.crash,
          });
        }
      }
    }
  }

  function yawTo(target: number): void {
    for (let i = 0; i < 1200; i++) {
      let err = target - headingYawRad(flight.orientation());
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err < -Math.PI) err += 2 * Math.PI;
      if (Math.abs(err) < 0.08 && Math.abs(flight.angularVelocity().yaw) < 0.35) {
        step(20, input({ throttle: 0.55 }));
        return;
      }
      step(1, input({ throttle: 0.55, yaw: Math.max(-1, Math.min(1, err * 2.2)) }));
    }
    throw new Error('yaw failed');
  }

  it('session starts inactive — controller-only path is body-frame', () => {
    expect(session.isActive()).toBe(false);
    flight.arm(0);
    yawTo(Math.PI / 2);
    step(35, input({ throttle: 0.55, pitch: 1 }));
    const up = bodyUpWorld(flight.orientation());
    expect(up.x).toBeGreaterThan(0.25);
    expect(Math.abs(up.x)).toBeGreaterThan(Math.abs(up.z) * 2);
  });

  it('processFixedStep returns null when session inactive (no orientation clobber)', () => {
    flight.arm(0);
    yawTo(Math.PI / 2);
    const before = { ...flight.orientation() };
    const correction = session.processFixedStep({
      position: flight.position(),
      velocity: flight.velocity(),
      orientation: flight.orientation(),
      angularVelocity: flight.angularVelocity(),
      armed: true,
      crashed: false,
      timestampMs: 0,
    });
    expect(correction).toBeNull();
    expect(flight.orientation()).toEqual(before);
  });

  it('applyCollisionCorrection without orientation leaves quaternion untouched', () => {
    flight.arm(0);
    yawTo(Math.PI / 2);
    const before = { ...flight.orientation() };
    flight.applyCollisionCorrection({
      position: { ...flight.position(), y: flight.position().y + 0.01 },
      velocity: { ...flight.velocity() },
      angularVelocity: { ...flight.angularVelocity() },
      crash: false,
    });
    expect(flight.orientation()).toEqual(before);
  });

  it('inactive session leaves controller velocity ledger unchanged (Layer 2)', () => {
    expect(session.isActive()).toBe(false);
    flight.enableForceLedgerDragIsolation(true);
    flight.setLegacyGroundEnabled(false);
    const q = quatFromAxisAngle(1, 0, 0, -Math.PI / 6);
    flight.reset({ position: { x: 0, y: 10, z: 0 }, orientation: q });
    flight.arm(0);
    flight.primeSmoothedInput({ throttle: 0.8, yaw: 0, pitch: 0, roll: 0 });
    flight.setAuthoritativePose({
      orientation: q,
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { pitch: 0, yaw: 0, roll: 0 },
    });
    flight.update({ throttle: 0.8, yaw: 0, pitch: 0, roll: 0 }, dt);
    const afterController = { ...flight.velocity() };
    const correction = session.processFixedStep({
      position: flight.position(),
      velocity: flight.velocity(),
      orientation: flight.orientation(),
      angularVelocity: flight.angularVelocity(),
      armed: true,
      crashed: false,
      timestampMs: 0,
    });
    expect(correction).toBeNull();
    expect(flight.velocity()).toEqual(afterController);
    expect(afterController.z).toBeLessThan(0);
    flight.recordPostPhysicsVelocity(flight.velocity());
    expect(flight.getLastForceLedger()?.velocityAfterPhysicsSession).toEqual(
      afterController,
    );
  });
});
