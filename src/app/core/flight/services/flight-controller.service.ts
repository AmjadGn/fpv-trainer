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
   * Passive disarmed flight: ballistic gravity + light quadratic aero drag.
   * Does not reuse armed-flight viscous drag (that model is for powered handling
   * feel and produces an unrealistically soft “float” after motor cut).
   * Residual angular momentum is damped; orientation keeps integrating.
   * Does not increment armed flight time.
   */
  private integratePassiveMotorCut(dt: number): void {
    this.integratePassiveAngular(dt);
    this.integratePassiveBallistic(dt);
  }

  /**
   * Dead-motor ballistic translation for a simulator (FPV “brick” drop):
   * a = g_down − c |v_rel| v_rel
   *
   * Armed-flight `maxVelocity` / viscous drag intentionally do NOT apply here —
   * those are powered handling limits and feel like a fake speed cap in freefall.
   * Keep c tiny so practical FPV altitudes stay near free-fall (no ~17 m/s soft ceiling).
   */
  private integratePassiveBallistic(dt: number): void {
    const cfg = this.cfg;
    const rel = this.scratchRel;
    rel.x = this.vel.x - this.windVel.x;
    rel.y = this.vel.y - this.windVel.y;
    rel.z = this.vel.z - this.windVel.z;

    const speed = Math.hypot(rel.x, rel.y, rel.z);
    // c ≈ 0.002 → terminal ≫ 60 m/s; irrelevant for typical training altitudes.
    const quadraticDrag = 0.002;

    let ax = 0;
    let ay = -cfg.gravity;
    let az = 0;
    if (speed > 1e-8) {
      const dragAccel = quadraticDrag * speed;
      ax -= dragAccel * rel.x;
      ay -= dragAccel * rel.y;
      az -= dragAccel * rel.z;
    }

    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    this.vel.z += az * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
  }

  private integratePassiveAngular(dt: number): void {
    const damping = Math.max(0.8, this.cfg.angularDamping);
    this.ang.pitch *= Math.exp(-damping * dt);
    this.ang.yaw *= Math.exp(-damping * dt);
    this.ang.roll *= Math.exp(-damping * dt);

    const wx = this.ang.pitch;
    const wy = this.ang.yaw;
    const wz = -this.ang.roll;
    const q = this.ori;
    const halfDt = 0.5 * dt;
    const dq = this.scratchDq;
    dq.x = halfDt * (wy * q.z - wz * q.y + wx * q.w);
    dq.y = halfDt * (wz * q.x - wx * q.z + wy * q.w);
    dq.z = halfDt * (wx * q.y - wy * q.x + wz * q.w);
    dq.w = halfDt * (-wx * q.x - wy * q.y - wz * q.z);
    q.x += dq.x;
    q.y += dq.y;
    q.z += dq.z;
    q.w += dq.w;
    normalizeQuat(q);
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

    const wx = this.ang.pitch;
    const wy = this.ang.yaw;
    const wz = -this.ang.roll;
    const q = this.ori;
    const halfDt = 0.5 * dt;
    const dq = this.scratchDq;
    dq.x = halfDt * (wy * q.z - wz * q.y + wx * q.w);
    dq.y = halfDt * (wz * q.x - wx * q.z + wy * q.w);
    dq.z = halfDt * (wx * q.y - wy * q.x + wz * q.w);
    dq.w = halfDt * (-wx * q.x - wy * q.y - wz * q.z);
    q.x += dq.x;
    q.y += dq.y;
    q.z += dq.z;
    q.w += dq.w;
    normalizeQuat(q);

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

    // Body rates → local angular velocity vector.
    // pitch about +X, yaw about +Y, roll about local forward (-Z).
    const wx = this.ang.pitch;
    const wy = this.ang.yaw;
    const wz = -this.ang.roll;

    // dq/dt = 0.5 * q ⊗ ω_quat, then integrate.
    const q = this.ori;
    const halfDt = 0.5 * dt;
    const dq = this.scratchDq;
    dq.x = halfDt * (wy * q.z - wz * q.y + wx * q.w);
    dq.y = halfDt * (wz * q.x - wx * q.z + wy * q.w);
    dq.z = halfDt * (wx * q.y - wy * q.x + wz * q.w);
    dq.w = halfDt * (-wx * q.x - wy * q.y - wz * q.z);

    q.x += dq.x;
    q.y += dq.y;
    q.z += dq.z;
    q.w += dq.w;
    normalizeQuat(q);
  }

  private integrateLinear(input: FlightInput, dt: number): void {
    const cfg = this.cfg;
    const throttle = clamp(input.throttle, 0, 1);

    // Local up (0,1,0) → world via orientation.
    rotateVecByQuat(0, 1, 0, this.ori, this.scratchUp);
    let thrustAccel = (throttle * cfg.maxThrust) / cfg.mass;

    // Optional ground effect: mild extra lift near the surface.
    if (cfg.groundEffectStrength > 0 && this.pos.y < cfg.groundEffectHeight) {
      const t =
        1 - clamp(this.pos.y / cfg.groundEffectHeight, 0, 1);
      thrustAccel *= 1 + cfg.groundEffectStrength * t * t;
    }

    let ax = this.scratchUp.x * thrustAccel;
    let ay = this.scratchUp.y * thrustAccel - cfg.gravity;
    let az = this.scratchUp.z * thrustAccel;

    // Relative air velocity: when wind is zero this matches legacy drag.
    const rel = this.scratchRel;
    rel.x = this.vel.x - this.windVel.x;
    rel.y = this.vel.y - this.windVel.y;
    rel.z = this.vel.z - this.windVel.z;

    // Linear drag + optional velocity damping against relative air velocity.
    const drag = cfg.linearDrag + cfg.velocityDamping;
    ax -= drag * rel.x;
    ay -= drag * rel.y;
    az -= drag * rel.z;

    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    this.vel.z += az * dt;

    if (cfg.maxVelocity > 0) {
      const speed = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
      if (speed > cfg.maxVelocity) {
        const s = cfg.maxVelocity / speed;
        this.vel.x *= s;
        this.vel.y *= s;
        this.vel.z *= s;
      }
    }

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
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

function normalizeQuat(q: Quat): void {
  const mag = Math.hypot(q.x, q.y, q.z, q.w);
  if (mag < 1e-12) {
    q.x = 0;
    q.y = 0;
    q.z = 0;
    q.w = 1;
    return;
  }
  const inv = 1 / mag;
  q.x *= inv;
  q.y *= inv;
  q.z *= inv;
  q.w *= inv;
}

/** Rotate vector (vx,vy,vz) by unit quaternion q into out. */
function rotateVecByQuat(
  vx: number,
  vy: number,
  vz: number,
  q: Quat,
  out: Vec3,
): void {
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  // v' = v + q.w * t + cross(q.xyz, t)
  out.x = vx + q.w * tx + (q.y * tz - q.z * ty);
  out.y = vy + q.w * ty + (q.z * tx - q.x * tz);
  out.z = vz + q.w * tz + (q.x * ty - q.y * tx);
}

/** Angle between drone local up and world up (rad). */
function tiltFromUpright(q: Quat): number {
  const up: Vec3 = { x: 0, y: 0, z: 0 };
  rotateVecByQuat(0, 1, 0, q, up);
  const cos = clamp(up.y, -1, 1);
  return Math.acos(cos);
}
