import type { CompiledAircraftSpecification } from '@fpv/aircraft-compiler';
import { clamp } from '@fpv/engineering-kernel';
import {
  mapPhysicalToFlightRuntime,
  mapSiInertiaToSolver,
  mapPhysicalAuthorityToSolver,
} from '@fpv/aircraft-compiler';

export {
  mapPhysicalToFlightRuntime,
  mapSiInertiaToSolver,
  mapPhysicalAuthorityToSolver,
};

/**
 * Portable flight profile shape — mirrors app FlightProfile without importing Angular.
 */
export interface AdaptedFlightProfile {
  readonly id: string;
  readonly version: string;
  readonly massKg: number;
  readonly maxThrustNewtons: number;
  readonly hoverThrottleRatio: number;
  readonly thrustCurveExponent: number;
  readonly throttleResponse: number;
  readonly thrustLag: number;
  readonly motorSpoolUpTime: number;
  readonly motorSpoolDownTime: number;
  readonly linearDrag: number;
  readonly frontalDragCoefficient: number;
  readonly lateralDragCoefficient: number;
  readonly verticalDragCoefficient: number;
  readonly velocityDamping: number;
  readonly angularDrag: number;
  readonly rollInertia: number;
  readonly pitchInertia: number;
  readonly yawInertia: number;
  readonly rollAcceleration: number;
  readonly pitchAcceleration: number;
  readonly yawAcceleration: number;
  readonly maxRollRate: number;
  readonly maxPitchRate: number;
  readonly maxYawRate: number;
  readonly stabilizationStrength: number;
  readonly selfLevelingAvailable: boolean;
  readonly altitudeAssistAvailable: boolean;
  readonly brakingStrength: number;
  readonly recoveryStrength: number;
  readonly gravityScale: number;
  readonly groundEffectStrength: number;
  readonly groundEffectHeight: number;
  readonly propWashStrength: number;
  readonly windSensitivity: number;
  readonly glideEfficiency: number;
  readonly maximumForwardSpeed: number;
  readonly maximumClimbSpeed: number;
  readonly maximumDescentSpeed: number;
  readonly maxVelocity: number;
  readonly landingTolerance: number;
  readonly collisionEnergyMultiplier: number;
  readonly crashVerticalSpeed: number;
  readonly crashHorizontalSpeed: number;
  readonly crashTiltAngleRad: number;
  readonly centerOfMassOffset: { x: number; y: number; z: number };
}

export interface AdaptedPhysicsFields {
  readonly widthMeters: number;
  readonly lengthMeters: number;
  readonly heightMeters: number;
  readonly wheelbaseMeters: number;
  readonly propellerDiameterMeters: number;
  readonly dryMassKg: number;
  readonly batteryMassKg: number;
  readonly takeoffMassKg: number;
  readonly centerOfMassOffset: { x: number; y: number; z: number };
  readonly centerOfMassHeight: number;
  readonly nominalVoltage: number;
  readonly batteryCellCount: number;
  readonly batteryCapacityMah: number;
  readonly maximumThrustNewtons: number;
  readonly hoverThrottleRatio: number;
  readonly thrustToWeightRatio: number;
  readonly motorResponseTime: number;
  readonly spoolUpTime: number;
  readonly spoolDownTime: number;
  readonly frontalDragCoefficient: number;
  readonly lateralDragCoefficient: number;
  readonly verticalDragCoefficient: number;
  readonly angularDrag: number;
  readonly propWashStrength: number;
  readonly groundEffectStrength: number;
  readonly windSensitivity: number;
  readonly glideEfficiency: number;
  readonly rollInertia: number;
  readonly pitchInertia: number;
  readonly yawInertia: number;
  readonly physicalInertiaKgM2?: {
    roll: number;
    pitch: number;
    yaw: number;
  };
  readonly angularAccelerationLimits: { x: number; y: number; z: number };
  readonly angularVelocityLimits: { x: number; y: number; z: number };
  readonly throttleCurve: number;
  readonly maximumForwardSpeed: number;
  readonly maximumClimbSpeed: number;
  readonly maximumDescentSpeed: number;
}

/**
 * Product-character / accessibility assistance hints.
 * These MUST NOT alter physical engineering outputs.
 * Competitive modes should set competitiveAssistDisabled.
 */
export interface FlightCharacterHints {
  readonly selfLevelingAvailable?: boolean;
  readonly altitudeAssistAvailable?: boolean;
  readonly stabilizationStrength?: number;
  readonly brakingStrength?: number;
  readonly recoveryStrength?: number;
  readonly landingTolerance?: number;
  readonly collisionEnergyMultiplier?: number;
  readonly maxVelocityScale?: number;
  readonly competitiveAssistDisabled?: boolean;
}

export function compiledToFlightProfile(
  spec: CompiledAircraftSpecification,
  profileId: string,
  hints: FlightCharacterHints = {},
): AdaptedFlightProfile {
  const rt = spec.flightRuntime;
  const perf = spec.performance;
  const drag = rt.linearDrag;
  const assist = hints.competitiveAssistDisabled ? {} : hints;
  const maxVelocity = clamp(
    (rt.maxThrustNewtons / Math.max(0.15, rt.massKg * (0.4 + drag))) *
      (assist.maxVelocityScale ?? 1),
    8,
    55,
  );
  const forward = maxVelocity * 0.9;
  const climb = maxVelocity * 0.35;
  const descent = maxVelocity * 0.4;

  return {
    id: profileId,
    version: spec.identity.engineeringModelVersion,
    massKg: rt.massKg,
    maxThrustNewtons: rt.maxThrustNewtons,
    hoverThrottleRatio: rt.hoverThrottleRatio,
    thrustCurveExponent: rt.thrustCurveExponent,
    throttleResponse: clamp(14 - rt.motorResponseTime * 40, 4, 16),
    thrustLag: rt.motorResponseTime * 0.8,
    motorSpoolUpTime: rt.motorSpoolUpTime,
    motorSpoolDownTime: rt.motorSpoolDownTime,
    linearDrag: rt.linearDrag,
    frontalDragCoefficient: rt.frontalDragCoefficient,
    lateralDragCoefficient: rt.lateralDragCoefficient,
    verticalDragCoefficient: rt.verticalDragCoefficient,
    velocityDamping: clamp(0.05 + drag * 0.25, 0.05, 0.4),
    angularDrag: rt.angularDrag,
    rollInertia: rt.rollInertia,
    pitchInertia: rt.pitchInertia,
    yawInertia: rt.yawInertia,
    rollAcceleration: rt.rollAcceleration,
    pitchAcceleration: rt.pitchAcceleration,
    yawAcceleration: rt.yawAcceleration,
    maxRollRate: rt.maxRollRate,
    maxPitchRate: rt.maxPitchRate,
    maxYawRate: rt.maxYawRate,
    stabilizationStrength:
      assist.stabilizationStrength ?? clamp(1.1 - perf.agilityRating, 0.25, 0.75),
    selfLevelingAvailable:
      assist.selfLevelingAvailable ??
      (hints.competitiveAssistDisabled
        ? false
        : perf.suggestedSkillLevel !== 'expert'),
    altitudeAssistAvailable:
      assist.altitudeAssistAvailable ??
      (hints.competitiveAssistDisabled
        ? false
        : perf.suggestedSkillLevel === 'beginner'),
    brakingStrength:
      assist.brakingStrength ?? clamp(1 - perf.momentumRating * 0.5, 0.3, 0.95),
    recoveryStrength:
      assist.recoveryStrength ?? clamp(1 - perf.agilityRating * 0.4, 0.35, 0.95),
    gravityScale: 1,
    groundEffectStrength: rt.groundEffectStrength,
    groundEffectHeight: rt.groundEffectHeight,
    propWashStrength: rt.propWashStrength,
    windSensitivity: rt.windSensitivity,
    glideEfficiency: rt.glideEfficiency,
    maximumForwardSpeed: forward,
    maximumClimbSpeed: climb,
    maximumDescentSpeed: descent,
    maxVelocity,
    landingTolerance:
      assist.landingTolerance ??
      (perf.suggestedSkillLevel === 'beginner' ? 1.4 : 0.9),
    collisionEnergyMultiplier:
      assist.collisionEnergyMultiplier ?? 0.5 + perf.momentumRating * 0.9,
    crashVerticalSpeed: 4 + rt.massKg * 2,
    crashHorizontalSpeed: 5 + rt.massKg * 3,
    crashTiltAngleRad: (55 * Math.PI) / 180,
    centerOfMassOffset: { ...rt.centerOfMassOffset },
  };
}

export function compiledToPhysicsFields(
  spec: CompiledAircraftSpecification,
  profile: AdaptedFlightProfile,
): AdaptedPhysicsFields {
  const a = spec.physicalAssembly;
  const rt = spec.flightRuntime;
  return {
    widthMeters: a.dimensions.widthMeters,
    lengthMeters: a.dimensions.lengthMeters,
    heightMeters: a.dimensions.heightMeters,
    wheelbaseMeters: a.dimensions.wheelbaseMeters,
    propellerDiameterMeters: a.propellerDiameterMeters,
    dryMassKg: a.dryMassKg,
    batteryMassKg: a.batteryMassKg,
    takeoffMassKg: a.totalMassKg,
    centerOfMassOffset: { ...a.centerOfMass },
    centerOfMassHeight: Math.abs(a.centerOfMass.z),
    nominalVoltage: rt.nominalVoltage,
    batteryCellCount: rt.batteryCellCount,
    batteryCapacityMah: rt.batteryCapacityMah,
    maximumThrustNewtons: rt.maxThrustNewtons,
    hoverThrottleRatio: rt.hoverThrottleRatio,
    thrustToWeightRatio: spec.propulsion.thrustToWeight,
    motorResponseTime: rt.motorResponseTime,
    spoolUpTime: rt.motorSpoolUpTime,
    spoolDownTime: rt.motorSpoolDownTime,
    frontalDragCoefficient: rt.frontalDragCoefficient,
    lateralDragCoefficient: rt.lateralDragCoefficient,
    verticalDragCoefficient: rt.verticalDragCoefficient,
    angularDrag: rt.angularDrag,
    propWashStrength: rt.propWashStrength,
    groundEffectStrength: rt.groundEffectStrength,
    windSensitivity: rt.windSensitivity,
    glideEfficiency: rt.glideEfficiency,
    rollInertia: rt.rollInertia,
    pitchInertia: rt.pitchInertia,
    yawInertia: rt.yawInertia,
    physicalInertiaKgM2: {
      roll: a.inertia.roll,
      pitch: a.inertia.pitch,
      yaw: a.inertia.yaw,
    },
    angularAccelerationLimits: {
      x: rt.rollAcceleration,
      y: rt.yawAcceleration,
      z: rt.pitchAcceleration,
    },
    angularVelocityLimits: {
      x: rt.maxRollRate,
      y: rt.maxYawRate,
      z: rt.maxPitchRate,
    },
    throttleCurve: rt.thrustCurveExponent,
    maximumForwardSpeed: profile.maximumForwardSpeed,
    maximumClimbSpeed: profile.maximumClimbSpeed,
    maximumDescentSpeed: profile.maximumDescentSpeed,
  };
}
