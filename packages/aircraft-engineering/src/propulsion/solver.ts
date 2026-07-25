import type { ComponentRevision } from '@fpv/component-catalog';
import type { ComponentSelection, UserTuningValues } from '@fpv/drone-build-domain';
import type { ElectricalSystemResult } from '../electrical/solver';

export interface ThrustSample {
  readonly throttle: number;
  readonly thrustNewtons: number;
  readonly currentA: number;
  readonly rpm: number;
}

export interface PropulsionUnitResult {
  readonly selectionId: string;
  readonly motorSelectionId: string;
  readonly maxThrustNewtons: number;
  readonly maxTransientThrustNewtons: number;
  readonly responseTimeS: number;
  readonly spoolUpTimeS: number;
  readonly spoolDownTimeS: number;
  readonly position: { x: number; y: number; z: number };
  readonly rotation: 'cw' | 'ccw';
  readonly thrustCurve: readonly ThrustSample[];
}

export interface PropulsionSystemResult {
  readonly units: readonly PropulsionUnitResult[];
  readonly totalMaxThrustNewtons: number;
  readonly thrustToWeight: number;
  readonly hoverThrottleEstimate: number;
}

function buildThrustCurve(
  maxThrust: number,
  maxCurrent: number,
  maxRpm: number,
  exponent: number,
): ThrustSample[] {
  const samples: ThrustSample[] = [];
  for (let i = 0; i <= 10; i++) {
    const throttle = i / 10;
    const thrust = maxThrust * Math.pow(throttle, exponent);
    samples.push({
      throttle,
      thrustNewtons: thrust,
      currentA: maxCurrent * Math.pow(throttle, 1.3),
      rpm: maxRpm * throttle,
    });
  }
  return samples;
}

export function solvePropulsion(
  selections: readonly ComponentSelection[],
  components: ReadonlyMap<string, ComponentRevision>,
  electrical: ElectricalSystemResult,
  totalMassKg: number,
  tuning: UserTuningValues,
): PropulsionSystemResult {
  const motors = selections.filter((s) => {
    const c = components.get(s.componentRevisionId);
    return c?.componentType === 'motor';
  });
  const props = selections.filter((s) => {
    const c = components.get(s.componentRevisionId);
    return c?.componentType === 'propeller';
  });

  const units: PropulsionUnitResult[] = [];
  let totalThrust = 0;

  for (let i = 0; i < motors.length; i++) {
    const motorSel = motors[i];
    const propSel = props[i] ?? props[0];
    const motor = components.get(motorSel.componentRevisionId);
    const prop = propSel
      ? components.get(propSel.componentRevisionId)
      : undefined;
    if (!motor || motor.engineering.type !== 'motor') continue;

    const propCt =
      prop && prop.engineering.type === 'propeller'
        ? prop.engineering.propeller.thrustCoefficient
        : 0.1;
    const voltageFactor = electrical.nominalVoltage / 14.8;
    const maxThrust =
      motor.engineering.motor.peakThrustHintNewtons *
      (0.85 + propCt) *
      Math.max(0.5, Math.min(1.6, voltageFactor));
    const transient = maxThrust * 1.08;
    const maxRpm =
      prop && prop.engineering.type === 'propeller'
        ? prop.engineering.propeller.recommendedRpmMax
        : 40000;
    const response = motor.engineering.motor.responseTimeConstantS;
    const curve = buildThrustCurve(
      maxThrust,
      motor.engineering.motor.maxContinuousCurrentA,
      maxRpm,
      tuning.thrustCurveExponent,
    );

    units.push({
      selectionId: propSel?.selectionId ?? `prop-unit-${i}`,
      motorSelectionId: motorSel.selectionId,
      maxThrustNewtons: maxThrust,
      maxTransientThrustNewtons: transient,
      responseTimeS: response,
      spoolUpTimeS: response * 1.2,
      spoolDownTimeS: response * 1.6,
      position: {
        x: motorSel.transform.position.x,
        y: motorSel.transform.position.y,
        z: motorSel.transform.position.z,
      },
      rotation: propSel?.propellerRotation ?? (i % 2 === 0 ? 'cw' : 'ccw'),
      thrustCurve: curve,
    });
    totalThrust += maxThrust;
  }

  const weightN = totalMassKg * 9.81;
  const twr = weightN > 0 ? totalThrust / weightN : 0;
  const hoverThrottle =
    totalThrust > 0
      ? Math.min(
          0.95,
          Math.pow(weightN / totalThrust, 1 / Math.max(0.5, tuning.thrustCurveExponent)),
        )
      : 1;

  return {
    units,
    totalMaxThrustNewtons: totalThrust,
    thrustToWeight: twr,
    hoverThrottleEstimate: hoverThrottle,
  };
}
