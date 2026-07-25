import type {
  ControlAuthorityResult,
  InertiaEstimate,
  PropulsionSystemResult,
  AerodynamicResult,
  ElectricalSystemResult,
  CenterOfMassResult,
} from '@fpv/aircraft-engineering';
import type { UserTuningValues } from '@fpv/drone-build-domain';
import type { CompiledFlightRuntimeConfiguration } from '../outputs/specification';

/**
 * Maps SI physical engineering into the legacy flight-solver configuration band.
 * Preserves v1.0 solver feel by applying the historical inertia scale and
 * authority shaping that previously lived inside the physical estimators.
 */
export interface PhysicalToRuntimeInput {
  readonly massKg: number;
  readonly propulsion: PropulsionSystemResult;
  readonly inertia: InertiaEstimate;
  readonly authority: ControlAuthorityResult;
  readonly aero: AerodynamicResult;
  readonly electrical: ElectricalSystemResult;
  readonly tuning: UserTuningValues;
  readonly centerOfMass: CenterOfMassResult;
}

export function mapSiInertiaToSolver(
  inertia: InertiaEstimate,
  totalMassKg: number,
): { rollInertia: number; pitchInertia: number; yawInertia: number } {
  const scale = 180 / Math.max(0.05, totalMassKg);
  return {
    rollInertia: Math.max(0.2, inertia.roll * scale + 0.3),
    pitchInertia: Math.max(0.2, inertia.pitch * scale + 0.3),
    yawInertia: Math.max(0.2, inertia.yaw * scale + 0.25),
  };
}

/**
 * Reconstruct historical control-authority shaping from SI torque + solver inertia.
 */
export function mapPhysicalAuthorityToSolver(
  authority: ControlAuthorityResult,
  solverInertia: { rollInertia: number; pitchInertia: number; yawInertia: number },
): {
  rollAcceleration: number;
  pitchAcceleration: number;
  yawAcceleration: number;
  maxRollRate: number;
  maxPitchRate: number;
  maxYawRate: number;
} {
  const rollAcc =
    authority.maxRollTorque / Math.max(0.05, solverInertia.rollInertia / 180);
  const pitchAcc =
    authority.maxPitchTorque / Math.max(0.05, solverInertia.pitchInertia / 180);
  const yawAcc =
    authority.maxYawTorque / Math.max(0.05, solverInertia.yawInertia / 180);

  return {
    rollAcceleration: Math.min(40, rollAcc * 0.15),
    pitchAcceleration: Math.min(40, pitchAcc * 0.15),
    yawAcceleration: Math.min(35, yawAcc * 0.12),
    maxRollRate: Math.min(12, 2.5 + rollAcc * 0.08),
    maxPitchRate: Math.min(12, 2.4 + pitchAcc * 0.08),
    maxYawRate: Math.min(10, 2.0 + yawAcc * 0.07),
  };
}

export function mapPhysicalToFlightRuntime(
  input: PhysicalToRuntimeInput,
): CompiledFlightRuntimeConfiguration {
  const avgSpoolUp =
    input.propulsion.units.reduce((a, u) => a + u.spoolUpTimeS, 0) /
    Math.max(1, input.propulsion.units.length);
  const avgSpoolDown =
    input.propulsion.units.reduce((a, u) => a + u.spoolDownTimeS, 0) /
    Math.max(1, input.propulsion.units.length);
  const avgResponse =
    input.propulsion.units.reduce((a, u) => a + u.responseTimeS, 0) /
    Math.max(1, input.propulsion.units.length);

  const mappedInertia = mapSiInertiaToSolver(input.inertia, input.massKg);
  const mappedAuthority = mapPhysicalAuthorityToSolver(
    input.authority,
    mappedInertia,
  );

  return {
    massKg: input.massKg,
    maxThrustNewtons: input.propulsion.totalMaxThrustNewtons,
    hoverThrottleRatio: input.propulsion.hoverThrottleEstimate,
    thrustCurveExponent: input.tuning.thrustCurveExponent,
    motorSpoolUpTime: avgSpoolUp,
    motorSpoolDownTime: avgSpoolDown,
    motorResponseTime: avgResponse,
    linearDrag: input.aero.linearDrag,
    frontalDragCoefficient: input.aero.frontalDragCoefficient,
    lateralDragCoefficient: input.aero.lateralDragCoefficient,
    verticalDragCoefficient: input.aero.verticalDragCoefficient,
    angularDrag: Math.max(0.05, input.aero.angularDrag),
    rollInertia: mappedInertia.rollInertia,
    pitchInertia: mappedInertia.pitchInertia,
    yawInertia: mappedInertia.yawInertia,
    rollAcceleration: mappedAuthority.rollAcceleration,
    pitchAcceleration: mappedAuthority.pitchAcceleration,
    yawAcceleration: mappedAuthority.yawAcceleration,
    maxRollRate: mappedAuthority.maxRollRate,
    maxPitchRate: mappedAuthority.maxPitchRate,
    maxYawRate: mappedAuthority.maxYawRate,
    groundEffectStrength: input.aero.groundEffectStrength,
    groundEffectHeight: input.aero.groundEffectHeight,
    propWashStrength: input.aero.propWashStrength,
    windSensitivity: input.aero.windSensitivity,
    glideEfficiency: input.aero.glideEfficiency,
    centerOfMassOffset: { ...input.centerOfMass.offsetFromOrigin },
    nominalVoltage: input.electrical.nominalVoltage,
    batteryCellCount: input.electrical.cellCount,
    batteryCapacityMah: input.electrical.capacityAh * 1000,
    safetyClamps: {
      maxAngularAcceleration: 50,
      minAngularDrag: 0.05,
    },
  };
}
