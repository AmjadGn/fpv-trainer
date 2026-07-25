import type { Vec3 } from '../../flight/models/flight-state.model';

/**
 * Configuration-driven flight profile consumed by the single flight solver.
 * Values are simulator approximations — not manufacturer-certified.
 */
export interface FlightProfile {
  id: string;
  version: string;

  massKg: number;
  maxThrustNewtons: number;
  /** Hover throttle fraction at takeoff mass under gravity (approx). */
  hoverThrottleRatio: number;
  thrustCurveExponent: number;
  throttleResponse: number;
  thrustLag: number;
  motorSpoolUpTime: number;
  motorSpoolDownTime: number;

  linearDrag: number;
  frontalDragCoefficient: number;
  lateralDragCoefficient: number;
  verticalDragCoefficient: number;
  velocityDamping: number;
  angularDrag: number;

  rollInertia: number;
  pitchInertia: number;
  yawInertia: number;
  rollAcceleration: number;
  pitchAcceleration: number;
  yawAcceleration: number;
  maxRollRate: number;
  maxPitchRate: number;
  maxYawRate: number;

  stabilizationStrength: number;
  selfLevelingAvailable: boolean;
  altitudeAssistAvailable: boolean;
  brakingStrength: number;
  recoveryStrength: number;

  gravityScale: number;
  groundEffectStrength: number;
  groundEffectHeight: number;
  propWashStrength: number;
  windSensitivity: number;
  glideEfficiency: number;

  maximumForwardSpeed: number;
  maximumClimbSpeed: number;
  maximumDescentSpeed: number;
  maxVelocity: number;

  landingTolerance: number;
  collisionEnergyMultiplier: number;
  crashVerticalSpeed: number;
  crashHorizontalSpeed: number;
  crashTiltAngleRad: number;

  centerOfMassOffset: Vec3;
}
