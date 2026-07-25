import { Injectable } from '@angular/core';

import type {
  CameraEffectsInput,
  CameraEffectsOutput,
} from '../models/camera-effects.model';
import {
  NEUTRAL_CAMERA_EFFECTS,
  clampFovOffset,
  intensityMultiplier,
  shouldSuppressContinuousEffects,
  smoothNoise,
} from '../models/camera-effects.model';

/**
 * Pure visual camera offsets from flight state.
 * Never mutates simulation position, orientation, or velocity.
 */
@Injectable({ providedIn: 'root' })
export class FlightCameraEffectsService {
  private time = 0;
  private impactRemaining = 0;
  private impactStrength = 0;
  private impactDirX = 0;
  private impactDirY = 1;
  private impactDirZ = 0;

  private lagPitch = 0;
  private lagYaw = 0;
  private lagRoll = 0;
  private fovCurrent = 0;

  private readonly out: CameraEffectsOutput = {
    positionOffset: { x: 0, y: 0, z: 0 },
    fovOffsetDegrees: 0,
    lookLagPitch: 0,
    lookLagYaw: 0,
    lookLagRoll: 0,
  };

  reset(): void {
    this.time = 0;
    this.impactRemaining = 0;
    this.impactStrength = 0;
    this.lagPitch = 0;
    this.lagYaw = 0;
    this.lagRoll = 0;
    this.fovCurrent = 0;
    this.copyNeutral();
  }

  /**
   * Trigger a short camera impulse (crash / hard landing).
   * Intensity is clamped; does not affect physics.
   */
  triggerImpact(intensity: number, dir?: { x: number; y: number; z: number }): void {
    const clamped = Math.min(1.5, Math.max(0, intensity));
    if (clamped < 0.05) {
      return;
    }
    this.impactStrength = Math.max(this.impactStrength, clamped);
    this.impactRemaining = Math.max(this.impactRemaining, 0.18 + clamped * 0.22);
    if (dir) {
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      this.impactDirX = dir.x / len;
      this.impactDirY = dir.y / len;
      this.impactDirZ = dir.z / len;
    } else {
      this.impactDirX = 0;
      this.impactDirY = 1;
      this.impactDirZ = 0;
    }
  }

  update(input: CameraEffectsInput, dt: number): CameraEffectsOutput {
    const settings = input.settings;
    const scale = intensityMultiplier(settings.cameraEffectsIntensity);

    if (
      !settings.cameraEffectsEnabled ||
      settings.cameraEffectsIntensity === 'off' ||
      scale <= 0
    ) {
      this.decayToNeutral(dt);
      return this.snapshot();
    }

    const suppressContinuous = shouldSuppressContinuousEffects(input);
    const allowImpact =
      settings.impactShakeEnabled &&
      (!input.prefersReducedMotion ||
        input.forceEffectsDespiteReducedMotion ||
        true); // impact kept minimal under reduced motion below

    this.time += dt;

    let ox = 0;
    let oy = 0;
    let oz = 0;

    if (!suppressContinuous && settings.speedVibrationEnabled) {
      const speedNorm = smoothstep(input.speed / 18);
      const amp = 0.0045 * speedNorm * scale;
      const t = this.time;
      ox += smoothNoise(t * 1.4, 1.1) * amp;
      oy += smoothNoise(t * 1.7, 2.3) * amp * 0.7;
      oz += smoothNoise(t * 1.55, 3.7) * amp * 0.5;
    }

    if (
      !suppressContinuous &&
      settings.throttleVibrationEnabled &&
      input.armed &&
      !input.crashed
    ) {
      const thr = Math.max(0, input.throttle);
      const idle = thr < 0.08 ? 0 : smoothstep((thr - 0.08) / 0.92);
      const amp = 0.0028 * idle * scale;
      const t = this.time;
      ox += Math.sin(t * 92) * amp;
      oy += Math.sin(t * 107 + 1.2) * amp * 0.8;
    }

    // Angular lag / spring (skipped under reduced motion & replay).
    if (!suppressContinuous) {
      const targetPitch = clamp(
        input.angularVelocity.pitch * 0.012 * scale,
        -0.035,
        0.035,
      );
      const targetYaw = clamp(
        input.angularVelocity.yaw * 0.01 * scale,
        -0.03,
        0.03,
      );
      const targetRoll = clamp(
        input.angularVelocity.roll * 0.01 * scale,
        -0.03,
        0.03,
      );
      const spring = 1 - Math.exp(-14 * dt);
      this.lagPitch += (targetPitch - this.lagPitch) * spring;
      this.lagYaw += (targetYaw - this.lagYaw) * spring;
      this.lagRoll += (targetRoll - this.lagRoll) * spring;
    } else {
      const settle = 1 - Math.exp(-18 * dt);
      this.lagPitch += (0 - this.lagPitch) * settle;
      this.lagYaw += (0 - this.lagYaw) * settle;
      this.lagRoll += (0 - this.lagRoll) * settle;
    }

    // Impact kick
    if (allowImpact && this.impactRemaining > 0) {
      this.impactRemaining = Math.max(0, this.impactRemaining - dt);
      const life = this.impactRemaining / 0.4;
      const reduced =
        input.prefersReducedMotion && !input.forceEffectsDespiteReducedMotion
          ? 0.35
          : 1;
      const kick =
        this.impactStrength * life * life * 0.055 * scale * reduced;
      ox += this.impactDirX * kick;
      oy += this.impactDirY * kick;
      oz += this.impactDirZ * kick;
    } else if (this.impactRemaining <= 0) {
      this.impactStrength = 0;
    }

    // Dynamic FOV
    let fovTarget = 0;
    if (
      settings.dynamicFovEnabled &&
      !suppressContinuous &&
      !(input.prefersReducedMotion && !input.forceEffectsDespiteReducedMotion)
    ) {
      const speedNorm = smoothstep(input.speed / 20);
      fovTarget = clampFovOffset(
        speedNorm * settings.dynamicFovStrength * scale,
        settings.dynamicFovStrength,
      );
    }
    if (input.replayMode && settings.dynamicFovEnabled) {
      // Optional mild FOV from recorded speed, still clamped.
      const speedNorm = smoothstep(input.speed / 20);
      fovTarget = clampFovOffset(
        speedNorm * settings.dynamicFovStrength * scale * 0.55,
        settings.dynamicFovStrength,
      );
    }
    const fovAlpha = 1 - Math.exp(-5 * dt);
    this.fovCurrent += (fovTarget - this.fovCurrent) * fovAlpha;

    // Hard clamp positional offsets so HUD stays readable.
    ox = clamp(ox, -0.02, 0.02);
    oy = clamp(oy, -0.02, 0.02);
    oz = clamp(oz, -0.02, 0.02);

    this.out.positionOffset.x = ox;
    this.out.positionOffset.y = oy;
    this.out.positionOffset.z = oz;
    this.out.fovOffsetDegrees = this.fovCurrent;
    this.out.lookLagPitch = this.lagPitch;
    this.out.lookLagYaw = this.lagYaw;
    this.out.lookLagRoll = this.lagRoll;
    return this.snapshot();
  }

  /** Read-only copy for consumers that must not mutate internal state. */
  snapshot(): CameraEffectsOutput {
    return {
      positionOffset: {
        x: this.out.positionOffset.x,
        y: this.out.positionOffset.y,
        z: this.out.positionOffset.z,
      },
      fovOffsetDegrees: this.out.fovOffsetDegrees,
      lookLagPitch: this.out.lookLagPitch,
      lookLagYaw: this.out.lookLagYaw,
      lookLagRoll: this.out.lookLagRoll,
    };
  }

  private decayToNeutral(dt: number): void {
    const a = 1 - Math.exp(-12 * dt);
    this.out.positionOffset.x *= 1 - a;
    this.out.positionOffset.y *= 1 - a;
    this.out.positionOffset.z *= 1 - a;
    this.lagPitch *= 1 - a;
    this.lagYaw *= 1 - a;
    this.lagRoll *= 1 - a;
    this.fovCurrent *= 1 - a;
    this.impactRemaining = Math.max(0, this.impactRemaining - dt);
    this.out.lookLagPitch = this.lagPitch;
    this.out.lookLagYaw = this.lagYaw;
    this.out.lookLagRoll = this.lagRoll;
    this.out.fovOffsetDegrees = this.fovCurrent;
  }

  private copyNeutral(): void {
    this.out.positionOffset.x = NEUTRAL_CAMERA_EFFECTS.positionOffset.x;
    this.out.positionOffset.y = NEUTRAL_CAMERA_EFFECTS.positionOffset.y;
    this.out.positionOffset.z = NEUTRAL_CAMERA_EFFECTS.positionOffset.z;
    this.out.fovOffsetDegrees = 0;
    this.out.lookLagPitch = 0;
    this.out.lookLagYaw = 0;
    this.out.lookLagRoll = 0;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
