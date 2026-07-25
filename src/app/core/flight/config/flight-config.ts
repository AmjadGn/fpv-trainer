import type { Vec3 } from '../models/flight-state.model';
import {
  DEFAULT_RATE_PROFILE_ID,
  RATE_PROFILES,
} from './rate-profiles';

/**
 * Tunable constants for the Milestone 4 flight model.
 *
 * Units:
 * - seconds (s)
 * - meters (m)
 * - meters per second (m/s)
 * - radians (rad)
 * - radians per second (rad/s)
 * - Newton-like thrust (mass * m/s²); thrust / mass = acceleration
 *
 * Rate limits / expo defaults come from the active {@link RATE_PROFILES} entry;
 * values below are shared physics and camera knobs.
 */
export const FLIGHT_CONFIG = {
  /** Downward gravitational acceleration (m/s²). */
  gravity: 9.81,

  /** Drone mass (kg). Used only to convert thrust → acceleration. */
  mass: 1.0,

  /**
   * Maximum thrust force at full throttle (N-like).
   * With mass=1 and gravity=9.81, hover throttle ≈ gravity / maxThrust ≈ 0.5.
   */
  maxThrust: 19.62,

  /** Linear drag coefficient applied as a = -linearDrag * v (1/s). */
  linearDrag: 0.45,

  /**
   * Extra velocity damping (1/s) for a slightly heavier feel.
   * Applied in addition to linearDrag.
   */
  velocityDamping: 0.12,

  /** Optional soft speed clamp (m/s). 0 disables. */
  maxVelocity: 28,

  /** Near-ground lift boost strength (dimensionless, 0 disables). */
  groundEffectStrength: 0.18,

  /** Height below which ground effect ramps in (m). */
  groundEffectHeight: 1.4,

  /** Default rates when no profile is applied (mirrored from Beginner). */
  maxPitchRate: RATE_PROFILES[DEFAULT_RATE_PROFILE_ID].maxPitchRate,
  maxRollRate: RATE_PROFILES[DEFAULT_RATE_PROFILE_ID].maxRollRate,
  maxYawRate: RATE_PROFILES[DEFAULT_RATE_PROFILE_ID].maxYawRate,
  angularResponse: RATE_PROFILES[DEFAULT_RATE_PROFILE_ID].angularResponse,
  angularDamping: RATE_PROFILES[DEFAULT_RATE_PROFILE_ID].angularDamping,
  angularInputSmoothing:
    RATE_PROFILES[DEFAULT_RATE_PROFILE_ID].angularInputSmoothing,

  /** Shared expo defaults (profiles override at runtime). */
  throttleExpo: RATE_PROFILES[DEFAULT_RATE_PROFILE_ID].throttleExpo,
  yawExpo: RATE_PROFILES[DEFAULT_RATE_PROFILE_ID].yawExpo,
  pitchExpo: RATE_PROFILES[DEFAULT_RATE_PROFILE_ID].pitchExpo,
  rollExpo: RATE_PROFILES[DEFAULT_RATE_PROFILE_ID].rollExpo,
  throttleCurveMidpoint:
    RATE_PROFILES[DEFAULT_RATE_PROFILE_ID].throttleCurveMidpoint,

  /** Fixed physics timestep (s). 1/120 recommended. */
  physicsStep: 1 / 120,

  /** Cap on accumulated frame delta to avoid spiral-of-death (s). */
  maxFrameDelta: 0.05,

  /** Vertical impact speed that causes a crash (m/s, downward magnitude). */
  crashVerticalSpeed: 4.5,

  /** Horizontal impact speed that causes a crash (m/s). */
  crashHorizontalSpeed: 6,

  /** World-up tilt from upright that causes a crash on ground contact (rad). */
  crashTiltAngle: (55 * Math.PI) / 180,

  /** Spawn position (m). Ground is y = 0. */
  initialPosition: { x: 0, y: 1, z: 0 } as Vec3,

  /** Maximum throttle allowed when arming. */
  armMaxThrottle: 0.1,

  /** Approximate ground contact epsilon (m). */
  groundEpsilon: 0.02,

  /** FPV camera pitch-up offset relative to drone forward (rad). */
  fpvCameraTilt: (8 * Math.PI) / 180,

  /** Chase camera follow offset in drone local space (m). */
  chaseOffset: { x: 0, y: 2.2, z: 5.5 } as Vec3,

  /** Chase camera smoothing factor (1/s). */
  chaseSmoothing: 6,

  /** Device pixel ratio cap for WebGL. */
  maxPixelRatio: 2,
} as const;

export type FlightConfig = typeof FLIGHT_CONFIG;
