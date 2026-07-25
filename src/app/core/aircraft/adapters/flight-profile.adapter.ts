import { FLIGHT_CONFIG } from '../../flight/config/flight-config';
import type { FlightProfile } from '../models/flight-profile.model';
import type { AircraftDefinition } from '../models/aircraft-definition.model';
import type { Vec3 } from '../../flight/models/flight-state.model';

/**
 * Mutable flight config slice applied to the single FlightControllerService.
 * Timing knobs (physicsStep / maxFrameDelta) remain on FLIGHT_CONFIG.
 */
export interface AppliedFlightConfig {
  gravity: number;
  mass: number;
  maxThrust: number;
  linearDrag: number;
  velocityDamping: number;
  maxVelocity: number;
  groundEffectStrength: number;
  groundEffectHeight: number;
  maxPitchRate: number;
  maxRollRate: number;
  maxYawRate: number;
  angularResponse: number;
  angularDamping: number;
  crashVerticalSpeed: number;
  crashHorizontalSpeed: number;
  crashTiltAngle: number;
  fpvCameraTilt: number;
  chaseOffset: Vec3;
  chaseSmoothing: number;
  windSensitivity: number;
  collisionEnergyMultiplier: number;
  brakingStrength: number;
  recoveryStrength: number;
  glideEfficiency: number;
  aircraftId: string;
  physicsProfileVersion: string;
}

export function flightProfileToAppliedConfig(
  def: AircraftDefinition,
  profile: FlightProfile = def.flightProfile,
): AppliedFlightConfig {
  const cam = def.cameraProfile;
  return {
    gravity: FLIGHT_CONFIG.gravity * profile.gravityScale,
    mass: profile.massKg,
    maxThrust: profile.maxThrustNewtons,
    linearDrag: profile.linearDrag,
    velocityDamping: profile.velocityDamping,
    maxVelocity: profile.maxVelocity,
    groundEffectStrength: profile.groundEffectStrength,
    groundEffectHeight: profile.groundEffectHeight,
    maxPitchRate: profile.maxPitchRate,
    maxRollRate: profile.maxRollRate,
    maxYawRate: profile.maxYawRate,
    angularResponse:
      (profile.rollAcceleration + profile.pitchAcceleration) /
      (2 * Math.max(0.5, (profile.rollInertia + profile.pitchInertia) / 2)),
    angularDamping: profile.angularDrag * 8,
    crashVerticalSpeed:
      profile.crashVerticalSpeed / Math.max(0.5, profile.landingTolerance),
    crashHorizontalSpeed:
      profile.crashHorizontalSpeed / Math.max(0.5, profile.landingTolerance),
    crashTiltAngle: profile.crashTiltAngleRad,
    fpvCameraTilt: (cam.fpv.cameraAngleDeg * Math.PI) / 180,
    chaseOffset: { ...cam.chase.localOffset },
    chaseSmoothing: cam.chase.followLag,
    windSensitivity: profile.windSensitivity,
    collisionEnergyMultiplier: profile.collisionEnergyMultiplier,
    brakingStrength: profile.brakingStrength,
    recoveryStrength: profile.recoveryStrength,
    glideEfficiency: profile.glideEfficiency,
    aircraftId: def.id,
    physicsProfileVersion: profile.version,
  };
}

export function defaultAppliedFlightConfig(): AppliedFlightConfig {
  return {
    gravity: FLIGHT_CONFIG.gravity,
    mass: FLIGHT_CONFIG.mass,
    maxThrust: FLIGHT_CONFIG.maxThrust,
    linearDrag: FLIGHT_CONFIG.linearDrag,
    velocityDamping: FLIGHT_CONFIG.velocityDamping,
    maxVelocity: FLIGHT_CONFIG.maxVelocity,
    groundEffectStrength: FLIGHT_CONFIG.groundEffectStrength,
    groundEffectHeight: FLIGHT_CONFIG.groundEffectHeight,
    maxPitchRate: FLIGHT_CONFIG.maxPitchRate,
    maxRollRate: FLIGHT_CONFIG.maxRollRate,
    maxYawRate: FLIGHT_CONFIG.maxYawRate,
    angularResponse: FLIGHT_CONFIG.angularResponse,
    angularDamping: FLIGHT_CONFIG.angularDamping,
    crashVerticalSpeed: FLIGHT_CONFIG.crashVerticalSpeed,
    crashHorizontalSpeed: FLIGHT_CONFIG.crashHorizontalSpeed,
    crashTiltAngle: FLIGHT_CONFIG.crashTiltAngle,
    fpvCameraTilt: FLIGHT_CONFIG.fpvCameraTilt,
    chaseOffset: { ...FLIGHT_CONFIG.chaseOffset },
    chaseSmoothing: FLIGHT_CONFIG.chaseSmoothing,
    windSensitivity: 1,
    collisionEnergyMultiplier: 1,
    brakingStrength: 0.5,
    recoveryStrength: 0.5,
    glideEfficiency: 0.5,
    aircraftId: 'legacy-default',
    physicsProfileVersion: 'legacy',
  };
}
