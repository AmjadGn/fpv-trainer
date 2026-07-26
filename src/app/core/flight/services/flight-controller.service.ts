import { Injectable, computed, signal } from '@angular/core';

import type { AppliedFlightConfig } from '../../aircraft/adapters/flight-profile.adapter';
import {
  defaultAppliedFlightConfig,
} from '../../aircraft/adapters/flight-profile.adapter';
import { FLIGHT_CONFIG } from '../config/flight-config';
import {
  DEFAULT_RATE_PROFILE_ID,
  RATE_PROFILES,
  applyProfileExpo,
  loadRateProfileId,
  saveRateProfileId,
  type RateProfile,
  type RateProfileId,
} from '../config/rate-profiles';
import { FlightInput, ZERO_FLIGHT_INPUT } from '../models/flight-input.model';
import type {
  AngularVelocity,
  Quat,
  Vec3,
} from '../models/flight-state.model';
import type { CrashReason } from '../../physics/models/collision.models';
import {
  bodyForwardWorld,
  bodyRightWorld,
  bodyUpWorld,
  headingYawRad,
  integrateBodyRates,
  normalizeQuat,
  rotateVecByQuat,
} from '../utils/quat-math';

/**
 * Development-only build identity for stale-localhost diagnosis.
 * Shown only when Frame Debug HUD is open (`environment.diagnosticsVisible`).
 * Update the short SHA after each hotfix commit intended for manual verification.
 */
export const FLIGHT_HOTFIX_BUILD_MARKER = 'BODY-FRAME HOTFIX 96d6ee8 CLEAN';

/** Authoritative body-frame snapshot for HUD diagnostics (dev only). */
export interface FlightFrameDiagnostics {
  quaternion: Quat;
  bodyForwardWorld: Vec3;
  bodyRightWorld: Vec3;
  bodyUpWorld: Vec3;
  /** World axis commanded pitch rotates about (current body-right). */
  commandedPitchAxisWorld: Vec3;
  /** World axis commanded roll rotates about (current body-forward). */
  commandedRollAxisWorld: Vec3;
  /**
   * Predicted thrust direction (= body up). Independent of final acceleration.
   * Do not treat as the acceleration that changed velocity.
   */
  thrustDirectionWorld: Vec3;
  linearVelocity: Vec3;
  headingYawRad: number;
  headingYawDeg: number;
  angularVelocity: AngularVelocity;
  /** Last fixed-step force ledger (null until first armed integrateLinear). */
  forceLedger: FlightForceLedger | null;
  buildMarker: string;
}

/**
 * Per-fixed-step translation budget. Units: m, m/s, m/s², world frame unless noted.
 * Source of truth for whether thrust direction matches actual velocity change.
 */
export interface FlightForceLedger {
  dt: number;
  positionBefore: Vec3;
  velocityBefore: Vec3;
  orientationBefore: Quat;
  throttleInput: number;
  pitchInput: number;
  rollInput: number;
  yawInput: number;
  bodyUpWorld: Vec3;
  /** Unit thrust direction used for force (body up). */
  thrustDirectionWorld: Vec3;
  thrustMagnitudeAccel: number;
  thrustAccelerationWorld: Vec3;
  gravityAccelerationWorld: Vec3;
  dragAccelerationWorld: Vec3;
  /** Reserved: training/assist — currently always zero in free flight. */
  assistAccelerationWorld: Vec3;
  collisionDeltaVelocity: Vec3;
  /** Explicit velocity overwrite after controller (e.g. maxVelocity clamp residual). */
  velocityOverrideDelta: Vec3;
  totalAccelerationWorld: Vec3;
  predictedVelocityAfter: Vec3;
  velocityAfterController: Vec3;
  /** Filled after PhysicsSession / Rapier sync when caller records it. */
  velocityAfterPhysicsSession: Vec3 | null;
  velocityAfterRapier: Vec3 | null;
  positionDelta: Vec3;
  positionAfter: Vec3;
  ledgerConsistent: boolean;
}

export interface FlightResetPose {
  position?: Vec3;
  orientation?: Quat;
}

export interface FlightCollisionCorrection {
  position: Vec3;
  velocity: Vec3;
  angularVelocity: AngularVelocity;
  orientation?: Quat;
  crash?: boolean;
  crashReason?: CrashReason;
  /** Allow brief post-crash tumble under gravity (no thrust). */
  enableTumble?: boolean;
}

/**
 * Optional wind sample applied during linear integration.
 * When null / zero, drag uses world velocity (identical to pre-wind physics).
 *
 * Approximation: aerodynamic drag operates on relative air velocity
 * (droneWorldVelocity − windVelocity). Steady wind therefore produces
 * horizontal drift without teleporting the craft. Mild optional torque is
 * applied from turbulence when windTorqueScale > 0.
 */
export interface FlightWindSample {
  velocity: Vec3;
  /** 0–1 turbulence intensity for optional mild torque. */
  turbulence?: number;
  gustActive?: boolean;
}

/**
 * Owns deterministic fixed-step acro flight simulation.
 *
 * Coordinate convention (documented in flight-state.model.ts):
 * X right, Y up, Z backward; drone forward = local -Z.
 * Orientation q maps body → world. Stick rates are body-local with
 * ω = (−pitch, −yaw, −roll) so +pitch is nose-down toward local −Z.
 * Integrate with dq/dt = ½ q ⊗ ω_body (shared quat-math helper).
 *
 * Does not access navigator, Gamepad API, DOM, templates, or Three.js.
 */
@Injectable({ providedIn: 'root' })
export class FlightControllerService {
  /**
   * Active aircraft-tuned physics knobs.
   * Timing constants (physicsStep / maxFrameDelta) stay on FLIGHT_CONFIG.
   */
  private cfg: AppliedFlightConfig = defaultAppliedFlightConfig();
  /** Scales rate-profile angular targets by aircraft class. */
  private aircraftRateScale = 1;
  private aircraftResponseScale = 1;
  private windSensitivity = 1;

  private readonly _armed = signal(false);
  private readonly _crashed = signal(false);
  private readonly _flightTime = signal(0);
  private readonly _armWarning = signal<string | null>(null);
  private readonly _rateProfileId = signal<RateProfileId>(
    loadRateProfileIdSafe(),
  );

  private readonly _position = signal<Vec3>({ ...FLIGHT_CONFIG.initialPosition });
  private readonly _velocity = signal<Vec3>({ x: 0, y: 0, z: 0 });
  private readonly _orientation = signal<Quat>({ x: 0, y: 0, z: 0, w: 1 });
  private readonly _angularVelocity = signal<AngularVelocity>({
    pitch: 0,
    yaw: 0,
    roll: 0,
  });

  // Mutable scratch used inside the fixed-step hot path (no per-step allocations).
  private pos: Vec3 = { ...FLIGHT_CONFIG.initialPosition };
  private vel: Vec3 = { x: 0, y: 0, z: 0 };
  private ori: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private ang: AngularVelocity = { pitch: 0, yaw: 0, roll: 0 };
  private time = 0;
  private armedFlag = false;
  private crashedFlag = false;
  /** When false, resolveGround is skipped (Rapier terrain owns contact). */
  private legacyGroundEnabled = true;
  /** Post-crash tumble under gravity (motors disarmed). */
  private tumbleActive = false;
  private tumbleTimeRemaining = 0;
  private lastCrashReason: CrashReason | null = null;
  private readonly _crashReason = signal<CrashReason | null>(null);
  /**
   * Passive ballistic coast after an airborne motor cut / disarm.
   *
   * Staging/reset drones stay frozen while disarmed so a craft parked above
   * terrain before arming does not fall. Once the pilot disarms while airborne,
   * this flag enables zero-thrust gravity + drag integration until reset/arm.
   */
  private motorCutCoastActive = false;

  /** Smoothed stick state for angular channels (and throttle). */
  private smoothed: FlightInput = { ...ZERO_FLIGHT_INPUT };

  /**
   * Active wind air-velocity. Zero vector → drag matches legacy world-velocity drag.
   * Cleared on reset.
   */
  private windVel: Vec3 = { x: 0, y: 0, z: 0 };
  private windTurbulence = 0;
  private windTorqueScale = 0;

  private readonly scratchUp: Vec3 = { x: 0, y: 0, z: 0 };
  private lastForceLedger: FlightForceLedger | null = null;
  /** When true, next integrateLinear zeros drag coefficients (test / diagnosis). */
  private forceLedgerIsolateDrag = false;
  private pendingCollisionDelta: Vec3 = { x: 0, y: 0, z: 0 };
  private stepPositionBefore: Vec3 = { x: 0, y: 0, z: 0 };
  private stepVelocityBefore: Vec3 = { x: 0, y: 0, z: 0 };
  private stepOrientationBefore: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private stepInputs: FlightInput = { ...ZERO_FLIGHT_INPUT };
  private readonly scratchDq: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly scratchRel: Vec3 = { x: 0, y: 0, z: 0 };

  private activeProfile: RateProfile =
    RATE_PROFILES[loadRateProfileIdSafe()];

  readonly armed = this._armed.asReadonly();
  readonly crashed = this._crashed.asReadonly();
  readonly crashReason = this._crashReason.asReadonly();
  readonly flightTime = this._flightTime.asReadonly();
  readonly position = this._position.asReadonly();
  readonly velocity = this._velocity.asReadonly();
  readonly orientation = this._orientation.asReadonly();
  readonly angularVelocity = this._angularVelocity.asReadonly();
  readonly armWarning = this._armWarning.asReadonly();
  readonly rateProfileId = this._rateProfileId.asReadonly();

  readonly rateProfile = computed(
    () => RATE_PROFILES[this._rateProfileId()],
  );

  readonly altitude = computed(() => Math.max(0, this._position().y));
  readonly speed = computed(() => length(this._velocity()));

  /**
   * Attempt to arm. Requires throttle at or below armMaxThrottle and not crashed.
   * Returns true when armed.
   */
  arm(throttle = 0): boolean {
    this._armWarning.set(null);

    if (this.crashedFlag) {
      this._armWarning.set('Reset after a crash before arming.');
      return false;
    }

    if (throttle > FLIGHT_CONFIG.armMaxThrottle) {
      this._armWarning.set('Lower throttle before arming');
      return false;
    }

    this.armedFlag = true;
    this.motorCutCoastActive = false;
    this._armed.set(true);
    return true;
  }

  disarm(): void {
    if (this.armedFlag && this.isAirborneForMotorCut()) {
      this.motorCutCoastActive = true;
    }
    this.armedFlag = false;
    this._armed.set(false);
    this._armWarning.set(null);
  }

  toggleArm(throttle = 0): boolean {
    if (this.armedFlag) {
      this.disarm();
      return false;
    }
    return this.arm(throttle);
  }

  /**
   * Switch rate profile. Persists locally. Returns false if blocked.
   * Caller should prevent changes during an active timed run.
   */
  setRateProfile(id: RateProfileId): boolean {
    const profile = RATE_PROFILES[id];
    if (!profile) {
      return false;
    }
    this.activeProfile = profile;
    this._rateProfileId.set(id);
    saveRateProfileId(id);
    return true;
  }

  /**
   * Apply configuration-driven aircraft flight profile.
   * Does not recreate the physics world — only solver parameters.
   */
  applyAircraftConfig(applied: AppliedFlightConfig): void {
    this.cfg = { ...applied, chaseOffset: { ...applied.chaseOffset } };
    this.windSensitivity = Number.isFinite(applied.windSensitivity)
      ? Math.max(0.1, applied.windSensitivity)
      : 1;

    // Relative to Flux-like baseline (~7.5 rad/s rates, ~12 response).
    const baselineRate = 7.5;
    const baselineResponse = 12;
    const aircraftRate =
      (applied.maxPitchRate + applied.maxRollRate + applied.maxYawRate) / 3;
    this.aircraftRateScale = clamp(aircraftRate / baselineRate, 0.35, 1.45);
    this.aircraftResponseScale = clamp(
      applied.angularResponse / baselineResponse,
      0.35,
      1.6,
    );
  }

  getAppliedAircraftId(): string {
    return this.cfg.aircraftId;
  }

  getCollisionEnergyMultiplier(): number {
    return this.cfg.collisionEnergyMultiplier;
  }

  /**
   * Body-frame diagnostics for the flight HUD overlay.
   * Pure read of authoritative controller state — no logging.
   */
  getFrameDiagnostics(): FlightFrameDiagnostics {
    const forward = bodyForwardWorld(this.ori);
    const right = bodyRightWorld(this.ori);
    const up = bodyUpWorld(this.ori);
    const heading = headingYawRad(this.ori);
    return {
      quaternion: { x: this.ori.x, y: this.ori.y, z: this.ori.z, w: this.ori.w },
      bodyForwardWorld: forward,
      bodyRightWorld: right,
      bodyUpWorld: up,
      commandedPitchAxisWorld: { ...right },
      commandedRollAxisWorld: { ...forward },
      thrustDirectionWorld: { ...up },
      linearVelocity: { x: this.vel.x, y: this.vel.y, z: this.vel.z },
      headingYawRad: heading,
      headingYawDeg: (heading * 180) / Math.PI,
      angularVelocity: {
        pitch: this.ang.pitch,
        yaw: this.ang.yaw,
        roll: this.ang.roll,
      },
      forceLedger: this.lastForceLedger,
      buildMarker: FLIGHT_HOTFIX_BUILD_MARKER,
    };
  }

  /** Last fixed-step force ledger (null until first armed linear step). */
  getLastForceLedger(): FlightForceLedger | null {
    return this.lastForceLedger;
  }

  /**
   * Diagnosis/test: set authoritative pose without resetting arm/crash flags.
   * Does not clear wind or rate profile.
   */
  setAuthoritativePose(pose: {
    position?: Vec3;
    velocity?: Vec3;
    orientation?: Quat;
    angularVelocity?: AngularVelocity;
  }): void {
    if (pose.position) {
      this.pos.x = pose.position.x;
      this.pos.y = pose.position.y;
      this.pos.z = pose.position.z;
    }
    if (pose.velocity) {
      this.vel.x = pose.velocity.x;
      this.vel.y = pose.velocity.y;
      this.vel.z = pose.velocity.z;
    }
    if (pose.orientation) {
      this.ori.x = pose.orientation.x;
      this.ori.y = pose.orientation.y;
      this.ori.z = pose.orientation.z;
      this.ori.w = pose.orientation.w;
      normalizeQuat(this.ori);
    }
    if (pose.angularVelocity) {
      this.ang.pitch = pose.angularVelocity.pitch;
      this.ang.yaw = pose.angularVelocity.yaw;
      this.ang.roll = pose.angularVelocity.roll;
    }
    this.publish();
  }

  /**
   * Diagnosis/test: bypass input smoothing so the next step sees exact sticks.
   */
  primeSmoothedInput(input: FlightInput): void {
    this.smoothed = {
      throttle: input.throttle,
      yaw: input.yaw,
      pitch: input.pitch,
      roll: input.roll,
    };
  }

  /**
   * Diagnosis-only: clear linear velocity while keeping pose/orientation.
   * Bound to KeyZ when Frame Debug is visible.
   */
  zeroLinearVelocity(): void {
    this.vel.x = 0;
    this.vel.y = 0;
    this.vel.z = 0;
    this.publish();
  }

  /**
   * Test seam: next armed linear steps use zero drag (does not persist to cfg).
   * Call {@link clearForceLedgerDragIsolation} to restore normal drag.
   */
  enableForceLedgerDragIsolation(enabled = true): void {
    this.forceLedgerIsolateDrag = enabled;
  }

  clearForceLedgerDragIsolation(): void {
    this.forceLedgerIsolateDrag = false;
  }

  /**
   * Record post-PhysicsSession / Rapier velocity onto the last ledger.
   * Call from the fixed-step loop after collision sync.
   */
  recordPostPhysicsVelocity(
    afterSession: Vec3,
    afterRapier: Vec3 | null = null,
  ): void {
    if (!this.lastForceLedger) {
      return;
    }
    this.lastForceLedger.velocityAfterPhysicsSession = {
      x: afterSession.x,
      y: afterSession.y,
      z: afterSession.z,
    };
    this.lastForceLedger.velocityAfterRapier = afterRapier
      ? { x: afterRapier.x, y: afterRapier.y, z: afterRapier.z }
      : null;
  }

  /**
   * Reset simulation. Optionally supply a course start pose.
   * Defaults to {@link FLIGHT_CONFIG.initialPosition} and identity orientation.
   */
  reset(pose?: FlightResetPose): void {
    this.armedFlag = false;
    this.crashedFlag = false;
    this.tumbleActive = false;
    this.tumbleTimeRemaining = 0;
    this.motorCutCoastActive = false;
    this.lastCrashReason = null;
    this._crashReason.set(null);
    this.time = 0;
    this.pos = {
      ...(pose?.position ?? FLIGHT_CONFIG.initialPosition),
    };
    this.vel = { x: 0, y: 0, z: 0 };
    this.ori = { ...(pose?.orientation ?? { x: 0, y: 0, z: 0, w: 1 }) };
    this.ang = { pitch: 0, yaw: 0, roll: 0 };
    this.smoothed = { ...ZERO_FLIGHT_INPUT };
    this.lastForceLedger = null;
    this.forceLedgerIsolateDrag = false;
    this.clearWind();
    this.publish();
    this._armWarning.set(null);
  }

  /**
   * When advanced collisions are active, disable flat-plane resolveGround.
   * When Rapier fails / is disabled, re-enable legacy ground.
   */
  setLegacyGroundEnabled(enabled: boolean): void {
    this.legacyGroundEnabled = enabled;
  }

  isLegacyGroundEnabled(): boolean {
    return this.legacyGroundEnabled;
  }

  getCrashReason(): CrashReason | null {
    return this.lastCrashReason;
  }

  /**
   * Apply hybrid Rapier collision correction into authoritative custom state.
   * Must be called from the same fixed-step path after {@link update}.
   */
  applyCollisionCorrection(correction: FlightCollisionCorrection): void {
    if (
      ![
        correction.position.x,
        correction.position.y,
        correction.position.z,
        correction.velocity.x,
        correction.velocity.y,
        correction.velocity.z,
      ].every(Number.isFinite)
    ) {
      return;
    }

    this.pendingCollisionDelta.x = correction.velocity.x - this.vel.x;
    this.pendingCollisionDelta.y = correction.velocity.y - this.vel.y;
    this.pendingCollisionDelta.z = correction.velocity.z - this.vel.z;
    if (this.lastForceLedger) {
      this.lastForceLedger.collisionDeltaVelocity = {
        x: this.pendingCollisionDelta.x,
        y: this.pendingCollisionDelta.y,
        z: this.pendingCollisionDelta.z,
      };
      const expectedX =
        this.lastForceLedger.velocityAfterController.x +
        this.pendingCollisionDelta.x;
      const expectedY =
        this.lastForceLedger.velocityAfterController.y +
        this.pendingCollisionDelta.y;
      const expectedZ =
        this.lastForceLedger.velocityAfterController.z +
        this.pendingCollisionDelta.z;
      this.lastForceLedger.ledgerConsistent =
        Math.hypot(
          correction.velocity.x - expectedX,
          correction.velocity.y - expectedY,
          correction.velocity.z - expectedZ,
        ) < 1e-5;
    }

    this.pos.x = correction.position.x;
    this.pos.y = correction.position.y;
    this.pos.z = correction.position.z;
    this.vel.x = correction.velocity.x;
    this.vel.y = correction.velocity.y;
    this.vel.z = correction.velocity.z;
    this.ang.pitch = correction.angularVelocity.pitch;
    this.ang.yaw = correction.angularVelocity.yaw;
    this.ang.roll = correction.angularVelocity.roll;

    if (correction.orientation) {
      this.ori.x = correction.orientation.x;
      this.ori.y = correction.orientation.y;
      this.ori.z = correction.orientation.z;
      this.ori.w = correction.orientation.w;
      normalizeQuat(this.ori);
    }

    if (correction.crash) {
      this.triggerCrash(correction.crashReason ?? 'unknown', {
        enableTumble: correction.enableTumble !== false,
      });
    }

    this.publish();
  }

  /**
   * Enter crash state with optional short tumble (no thrust / control).
   */
  triggerCrash(
    reason: CrashReason = 'unknown',
    opts?: { enableTumble?: boolean },
  ): void {
    this.crashedFlag = true;
    this.armedFlag = false;
    this.motorCutCoastActive = false;
    this.lastCrashReason = reason;
    this._crashReason.set(reason);
    if (opts?.enableTumble !== false) {
      this.tumbleActive = true;
      this.tumbleTimeRemaining = 0.85;
    } else {
      this.tumbleActive = false;
      this.tumbleTimeRemaining = 0;
      this.vel.x = 0;
      this.vel.y = 0;
      this.vel.z = 0;
      this.ang.pitch = 0;
      this.ang.yaw = 0;
      this.ang.roll = 0;
    }
    this.publish();
  }

  /**
   * Provide the current wind sample for the next physics steps.
   * Pass null or a zero velocity to disable wind influence (legacy behavior).
   */
  setWindSample(sample: FlightWindSample | null): void {
    if (!sample) {
      this.clearWind();
      return;
    }
    const sens = this.windSensitivity;
    const vx = Number.isFinite(sample.velocity.x) ? sample.velocity.x * sens : 0;
    const vy = Number.isFinite(sample.velocity.y) ? sample.velocity.y * sens : 0;
    const vz = Number.isFinite(sample.velocity.z) ? sample.velocity.z * sens : 0;
    this.windVel.x = vx;
    this.windVel.y = vy;
    this.windVel.z = vz;
    this.windTurbulence = clamp(
      Number.isFinite(sample.turbulence ?? 0)
        ? (sample.turbulence ?? 0) * sens
        : 0,
      0,
      2,
    );
  }

  /**
   * Scale for optional mild turbulence torque (0 = off).
   * Keep small; does not override stick input.
   */
  setWindTorqueScale(scale: number): void {
    this.windTorqueScale = clamp(
      Number.isFinite(scale) ? scale : 0,
      0,
      0.35,
    );
  }

  clearWind(): void {
    this.windVel.x = 0;
    this.windVel.y = 0;
    this.windVel.z = 0;
    this.windTurbulence = 0;
  }

  /** Simulation elapsed time (seconds) while armed. */
  getSimulationTime(): number {
    return this.time;
  }

  /**
   * Advance simulation by one fixed timestep.
   * Callers must use a fixed delta (typically FLIGHT_CONFIG.physicsStep).
   *
   * - Armed: full thrust / attitude integration.
   * - Disarmed after airborne motor cut: zero-thrust ballistic coast (gravity + drag).
   * - Disarmed staging/reset (never motor-cut airborne): frozen in place.
   * - Crashed: optional brief tumble, otherwise frozen.
   */
  update(input: FlightInput, fixedDeltaSeconds: number): void {
    const dt = fixedDeltaSeconds;
    if (!(dt > 0) || !Number.isFinite(dt)) {
      return;
    }

    if (this.crashedFlag && this.tumbleActive) {
      this.integrateTumble(dt);
      this.publish();
      return;
    }

    if (this.crashedFlag) {
      return;
    }

    if (!this.armedFlag) {
      if (this.motorCutCoastActive) {
        // Zero thrust / ignore sticks — preserve momentum under gravity + drag.
        this.integratePassiveMotorCut(dt);
        if (this.legacyGroundEnabled) {
          this.resolveGround();
        }
        this.publish();
      }
      return;
    }

    this.time += dt;
    const shaped = applyProfileExpo(input, this.activeProfile);
    const filtered = this.smoothInput(shaped, dt);
    this.stepPositionBefore.x = this.pos.x;
    this.stepPositionBefore.y = this.pos.y;
    this.stepPositionBefore.z = this.pos.z;
    this.stepVelocityBefore.x = this.vel.x;
    this.stepVelocityBefore.y = this.vel.y;
    this.stepVelocityBefore.z = this.vel.z;
    this.stepOrientationBefore.x = this.ori.x;
    this.stepOrientationBefore.y = this.ori.y;
    this.stepOrientationBefore.z = this.ori.z;
    this.stepOrientationBefore.w = this.ori.w;
    this.stepInputs.throttle = filtered.throttle;
    this.stepInputs.pitch = filtered.pitch;
    this.stepInputs.roll = filtered.roll;
    this.stepInputs.yaw = filtered.yaw;
    this.pendingCollisionDelta.x = 0;
    this.pendingCollisionDelta.y = 0;
    this.pendingCollisionDelta.z = 0;
    this.integrateAngular(filtered, dt);
    this.integrateLinear(filtered, dt);
    if (this.legacyGroundEnabled) {
      this.resolveGround();
    }
    this.publish();
  }

  /**
   * True when the craft is clear of the ground plane or still carrying momentum.
   * Used only to distinguish airborne motor cut from pre-arm staging/reset.
   */
  private isAirborneForMotorCut(): boolean {
    const groundClearance = FLIGHT_CONFIG.groundEpsilon + 0.05;
    if (this.pos.y > groundClearance) {
      return true;
    }
    const speed = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    return speed > 0.05;
  }

  /**
   * Passive disarmed flight: pure gravity freefall + residual angular damping.
   * No aero drag, no maxVelocity — dead motors must not soft-cap descent.
   * Does not increment armed flight time.
   */
  private integratePassiveMotorCut(dt: number): void {
    this.integratePassiveAngular(dt);
    this.integratePassiveBallistic(dt);
  }

  /**
   * Dead-motor translation: gravity and momentum only.
   * Intentionally omits aero drag and armed `maxVelocity` so fall speed is uncapped.
   */
  private integratePassiveBallistic(dt: number): void {
    this.vel.y -= this.cfg.gravity * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
  }

  private integratePassiveAngular(dt: number): void {
    const damping = Math.max(0.8, this.cfg.angularDamping);
    this.ang.pitch *= Math.exp(-damping * dt);
    this.ang.yaw *= Math.exp(-damping * dt);
    this.ang.roll *= Math.exp(-damping * dt);

    integrateBodyRates(
      this.ori,
      this.ang.pitch,
      this.ang.yaw,
      this.ang.roll,
      dt,
      this.scratchDq,
    );
  }

  private integrateTumble(dt: number): void {
    this.tumbleTimeRemaining -= dt;
    // Gravity + strong drag; no thrust.
    this.vel.y -= this.cfg.gravity * dt;
    this.vel.x *= Math.exp(-2.2 * dt);
    this.vel.y *= Math.exp(-0.35 * dt);
    this.vel.z *= Math.exp(-2.2 * dt);
    this.ang.pitch *= Math.exp(-1.2 * dt);
    this.ang.yaw *= Math.exp(-1.2 * dt);
    this.ang.roll *= Math.exp(-1.2 * dt);

    integrateBodyRates(
      this.ori,
      this.ang.pitch,
      this.ang.yaw,
      this.ang.roll,
      dt,
      this.scratchDq,
    );

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    if (this.legacyGroundEnabled && this.pos.y < FLIGHT_CONFIG.groundEpsilon) {
      this.pos.y = FLIGHT_CONFIG.groundEpsilon;
      this.vel.x *= 0.4;
      this.vel.y = 0;
      this.vel.z *= 0.4;
      this.tumbleActive = false;
      this.tumbleTimeRemaining = 0;
    }

    if (this.tumbleTimeRemaining <= 0) {
      this.tumbleActive = false;
      this.vel.x = 0;
      this.vel.y = 0;
      this.vel.z = 0;
      this.ang.pitch = 0;
      this.ang.yaw = 0;
      this.ang.roll = 0;
    }
  }

  private smoothInput(input: FlightInput, dt: number): FlightInput {
    const alpha =
      1 -
      Math.exp(-Math.max(0.1, this.activeProfile.angularInputSmoothing) * dt);
    this.smoothed.throttle += (input.throttle - this.smoothed.throttle) * alpha;
    this.smoothed.yaw += (input.yaw - this.smoothed.yaw) * alpha;
    this.smoothed.pitch += (input.pitch - this.smoothed.pitch) * alpha;
    this.smoothed.roll += (input.roll - this.smoothed.roll) * alpha;
    return this.smoothed;
  }

  private integrateAngular(input: FlightInput, dt: number): void {
    const profile = this.activeProfile;
    const rateScale = this.aircraftRateScale;
    const responseScale = this.aircraftResponseScale;
    const targetPitch =
      clamp(input.pitch, -1, 1) * profile.maxPitchRate * rateScale;
    const targetYaw =
      clamp(input.yaw, -1, 1) * profile.maxYawRate * rateScale;
    const targetRoll =
      clamp(input.roll, -1, 1) * profile.maxRollRate * rateScale;

    const stickMag =
      Math.abs(input.pitch) + Math.abs(input.yaw) + Math.abs(input.roll);
    const damping = stickMag < 0.08 ? profile.angularDamping : 0;
    const response = profile.angularResponse * responseScale;

    this.ang.pitch = approach(
      this.ang.pitch,
      targetPitch,
      response,
      damping,
      dt,
    );
    this.ang.yaw = approach(this.ang.yaw, targetYaw, response, damping, dt);
    this.ang.roll = approach(
      this.ang.roll,
      targetRoll,
      response,
      damping,
      dt,
    );

    // Mild turbulence torque — never overrides stick targets strongly.
    if (this.windTorqueScale > 0 && this.windTurbulence > 0.05) {
      const torque =
        this.windTorqueScale * this.windTurbulence * 0.15;
      const phase = this.time * 2.7;
      this.ang.pitch += Math.sin(phase) * torque * dt;
      this.ang.roll += Math.cos(phase * 1.3) * torque * dt;
      this.ang.yaw += Math.sin(phase * 0.7) * torque * 0.35 * dt;
    }

    // Body rates → orientation via shared integrateBodyRates (q ⊗ ω_body).
    integrateBodyRates(
      this.ori,
      this.ang.pitch,
      this.ang.yaw,
      this.ang.roll,
      dt,
      this.scratchDq,
    );
  }

  private integrateLinear(input: FlightInput, dt: number): void {
    const cfg = this.cfg;
    const throttle = clamp(input.throttle, 0, 1);
    /** Near-zero throttle ≈ unpowered: do not soft-cap vertical fall. */
    const unpowered = throttle <= 0.001;

    const velBeforeX = this.vel.x;
    const velBeforeY = this.vel.y;
    const velBeforeZ = this.vel.z;

    // Local up (0,1,0) → world via orientation.
    rotateVecByQuat(0, 1, 0, this.ori, this.scratchUp);
    let thrustAccel = (throttle * cfg.maxThrust) / cfg.mass;

    // Optional ground effect: mild extra lift near the surface.
    if (
      !unpowered &&
      cfg.groundEffectStrength > 0 &&
      this.pos.y < cfg.groundEffectHeight
    ) {
      const t =
        1 - clamp(this.pos.y / cfg.groundEffectHeight, 0, 1);
      thrustAccel *= 1 + cfg.groundEffectStrength * t * t;
    }

    const thrustAx = this.scratchUp.x * thrustAccel;
    const thrustAy = this.scratchUp.y * thrustAccel;
    const thrustAz = this.scratchUp.z * thrustAccel;
    const gravAy = -cfg.gravity;

    // Relative air velocity: when wind is zero this matches legacy drag.
    const rel = this.scratchRel;
    rel.x = this.vel.x - this.windVel.x;
    rel.y = this.vel.y - this.windVel.y;
    rel.z = this.vel.z - this.windVel.z;

    const drag = this.forceLedgerIsolateDrag
      ? 0
      : cfg.linearDrag + cfg.velocityDamping;
    let dragAx = 0;
    let dragAy = 0;
    let dragAz = 0;
    if (unpowered) {
      // Horizontal air resistance only — vertical viscous drag created a fake
      // ~g/drag ≈ 17 m/s soft ceiling that felt like a speed limit with motors idle.
      dragAx = -drag * rel.x;
      dragAz = -drag * rel.z;
    } else {
      dragAx = -drag * rel.x;
      dragAy = -drag * rel.y;
      dragAz = -drag * rel.z;
    }

    // Assist/training horizontal movement: not implemented in free flight.
    const assistAx = 0;
    const assistAy = 0;
    const assistAz = 0;

    const ax = thrustAx + dragAx + assistAx;
    const ay = thrustAy + gravAy + dragAy + assistAy;
    const az = thrustAz + dragAz + assistAz;

    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    this.vel.z += az * dt;

    const predictedX = this.vel.x;
    const predictedY = this.vel.y;
    const predictedZ = this.vel.z;
    let overrideDx = 0;
    let overrideDy = 0;
    let overrideDz = 0;

    // Powered handling clamp only — never limit an unpowered descent/dive.
    if (!unpowered && cfg.maxVelocity > 0) {
      const speed = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
      if (speed > cfg.maxVelocity) {
        const s = cfg.maxVelocity / speed;
        const nx = this.vel.x * s;
        const ny = this.vel.y * s;
        const nz = this.vel.z * s;
        overrideDx = nx - this.vel.x;
        overrideDy = ny - this.vel.y;
        overrideDz = nz - this.vel.z;
        this.vel.x = nx;
        this.vel.y = ny;
        this.vel.z = nz;
      }
    }

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    const expectedX = velBeforeX + ax * dt + overrideDx;
    const expectedY = velBeforeY + ay * dt + overrideDy;
    const expectedZ = velBeforeZ + az * dt + overrideDz;
    const ledgerConsistent =
      Math.hypot(
        this.vel.x - expectedX,
        this.vel.y - expectedY,
        this.vel.z - expectedZ,
      ) < 1e-9;

    this.lastForceLedger = {
      dt,
      positionBefore: {
        x: this.stepPositionBefore.x,
        y: this.stepPositionBefore.y,
        z: this.stepPositionBefore.z,
      },
      velocityBefore: { x: velBeforeX, y: velBeforeY, z: velBeforeZ },
      orientationBefore: {
        x: this.stepOrientationBefore.x,
        y: this.stepOrientationBefore.y,
        z: this.stepOrientationBefore.z,
        w: this.stepOrientationBefore.w,
      },
      throttleInput: this.stepInputs.throttle,
      pitchInput: this.stepInputs.pitch,
      rollInput: this.stepInputs.roll,
      yawInput: this.stepInputs.yaw,
      bodyUpWorld: {
        x: this.scratchUp.x,
        y: this.scratchUp.y,
        z: this.scratchUp.z,
      },
      thrustDirectionWorld: {
        x: this.scratchUp.x,
        y: this.scratchUp.y,
        z: this.scratchUp.z,
      },
      thrustMagnitudeAccel: thrustAccel,
      thrustAccelerationWorld: { x: thrustAx, y: thrustAy, z: thrustAz },
      gravityAccelerationWorld: { x: 0, y: gravAy, z: 0 },
      dragAccelerationWorld: { x: dragAx, y: dragAy, z: dragAz },
      assistAccelerationWorld: { x: assistAx, y: assistAy, z: assistAz },
      collisionDeltaVelocity: {
        x: this.pendingCollisionDelta.x,
        y: this.pendingCollisionDelta.y,
        z: this.pendingCollisionDelta.z,
      },
      velocityOverrideDelta: { x: overrideDx, y: overrideDy, z: overrideDz },
      totalAccelerationWorld: { x: ax, y: ay, z: az },
      predictedVelocityAfter: {
        x: predictedX,
        y: predictedY,
        z: predictedZ,
      },
      velocityAfterController: {
        x: this.vel.x,
        y: this.vel.y,
        z: this.vel.z,
      },
      velocityAfterPhysicsSession: null,
      velocityAfterRapier: null,
      positionDelta: {
        x: this.pos.x - this.stepPositionBefore.x,
        y: this.pos.y - this.stepPositionBefore.y,
        z: this.pos.z - this.stepPositionBefore.z,
      },
      positionAfter: { x: this.pos.x, y: this.pos.y, z: this.pos.z },
      ledgerConsistent,
    };
  }

  private resolveGround(): void {
    const groundY = FLIGHT_CONFIG.groundEpsilon;
    if (this.pos.y > groundY) {
      return;
    }

    this.pos.y = groundY;

    const verticalSpeed = -this.vel.y; // positive when descending
    const horizontalSpeed = Math.hypot(this.vel.x, this.vel.z);
    const tilt = tiltFromUpright(this.ori);

    const hardImpact =
      verticalSpeed > this.cfg.crashVerticalSpeed ||
      horizontalSpeed > this.cfg.crashHorizontalSpeed ||
      tilt > this.cfg.crashTiltAngle;

    if (hardImpact) {
      this.triggerCrash(
        tilt > this.cfg.crashTiltAngle ? 'hardLanding' : 'terrain',
        { enableTumble: false },
      );
      this.vel.x = 0;
      this.vel.y = 0;
      this.vel.z = 0;
      this.ang.pitch = 0;
      this.ang.yaw = 0;
      this.ang.roll = 0;
      return;
    }

    // Soft landing: kill downward velocity, keep upright-ish.
    if (this.vel.y < 0) {
      this.vel.y = 0;
    }
  }

  private publish(): void {
    this._armed.set(this.armedFlag);
    this._crashed.set(this.crashedFlag);
    this._flightTime.set(this.time);
    this._position.set({ x: this.pos.x, y: this.pos.y, z: this.pos.z });
    this._velocity.set({ x: this.vel.x, y: this.vel.y, z: this.vel.z });
    this._orientation.set({
      x: this.ori.x,
      y: this.ori.y,
      z: this.ori.z,
      w: this.ori.w,
    });
    this._angularVelocity.set({
      pitch: this.ang.pitch,
      yaw: this.ang.yaw,
      roll: this.ang.roll,
    });
  }
}

function loadRateProfileIdSafe(): RateProfileId {
  try {
    return loadRateProfileId();
  } catch {
    return DEFAULT_RATE_PROFILE_ID;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function approach(
  current: number,
  target: number,
  response: number,
  damping: number,
  dt: number,
): number {
  let next = current + (target - current) * (1 - Math.exp(-response * dt));
  if (damping > 0) {
    next *= Math.exp(-damping * dt);
  }
  return next;
}

function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

/** Angle between drone local up and world up (rad). */
function tiltFromUpright(q: Quat): number {
  const up: Vec3 = { x: 0, y: 0, z: 0 };
  rotateVecByQuat(0, 1, 0, q, up);
  const cos = clamp(up.y, -1, 1);
  return Math.acos(cos);
}
