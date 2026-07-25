import type { ResolvedAssembly, UserTuningValues } from '@fpv/drone-build-domain';
import type { ElectricalSystemResult } from '../electrical/solver';

export interface ThrustSample {
  readonly throttle: number;
  readonly thrustNewtons: number;
  readonly currentA: number;
  readonly rpm: number;
}

export type PropulsionDataProvenance =
  | 'measured-table'
  | 'peak-thrust-hint-fallback'
  | 'estimated';

export interface PropulsionUnitResult {
  readonly selectionId: string;
  readonly motorSelectionId: string;
  readonly propellerSelectionId: string;
  readonly maxThrustNewtons: number;
  readonly maxTransientThrustNewtons: number;
  readonly responseTimeS: number;
  readonly spoolUpTimeS: number;
  readonly spoolDownTimeS: number;
  readonly position: { x: number; y: number; z: number };
  readonly rotation: 'cw' | 'ccw';
  readonly thrustCurve: readonly ThrustSample[];
  readonly dataProvenance: PropulsionDataProvenance;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly fallbackPath: string | null;
  readonly modelVersion: string;
}

export interface PropulsionSystemResult {
  readonly units: readonly PropulsionUnitResult[];
  readonly totalMaxThrustNewtons: number;
  readonly thrustToWeight: number;
  readonly hoverThrottleEstimate: number;
  readonly modelVersion: string;
  readonly dataProvenance: PropulsionDataProvenance;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly warnings: readonly string[];
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

/**
 * Topology-driven propulsion solver.
 * Consumes ResolvedPropulsionUnit relationships — never pairs by array index.
 *
 * Current thrust model is an explicit approximation using motor.peakThrustHintNewtons
 * scaled by propeller thrust coefficient and battery voltage. This is NOT a measured
 * motor/prop performance table. Future measured tables can replace the unit loop
 * without changing the build domain.
 */
export function solvePropulsion(
  assembly: ResolvedAssembly,
  electrical: ElectricalSystemResult,
  totalMassKg: number,
  tuning: UserTuningValues,
): PropulsionSystemResult {
  const units: PropulsionUnitResult[] = [];
  let totalThrust = 0;
  const warnings: string[] = [
    'propulsion uses peakThrustHintNewtons fallback — not measured performance tables',
  ];

  for (const pu of assembly.propulsionUnits) {
    const motor = pu.motorComponent;
    const prop = pu.propellerComponent;
    if (motor.engineering.type !== 'motor') continue;

    const propCt =
      prop.engineering.type === 'propeller'
        ? prop.engineering.propeller.thrustCoefficient
        : 0.1;
    const voltageFactor = electrical.nominalVoltage / 14.8;
    const maxThrust =
      motor.engineering.motor.peakThrustHintNewtons *
      (0.85 + propCt) *
      Math.max(0.5, Math.min(1.6, voltageFactor));
    const transient = maxThrust * 1.08;
    const maxRpm =
      prop.engineering.type === 'propeller'
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
      selectionId: pu.propellerSelection.selectionId,
      motorSelectionId: pu.motorSelection.selectionId,
      propellerSelectionId: pu.propellerSelection.selectionId,
      maxThrustNewtons: maxThrust,
      maxTransientThrustNewtons: transient,
      responseTimeS: response,
      spoolUpTimeS: response * 1.2,
      spoolDownTimeS: response * 1.6,
      position: { ...pu.position },
      rotation: pu.rotationDirection,
      thrustCurve: curve,
      dataProvenance: 'peak-thrust-hint-fallback',
      confidence: 'low',
      fallbackPath: 'motor.peakThrustHintNewtons * (0.85 + propCt) * voltageFactor',
      modelVersion: '1.1.1-hint-approx',
    });
    totalThrust += maxThrust;
  }

  const weightN = totalMassKg * 9.81;
  const twr = weightN > 0 ? totalThrust / weightN : 0;
  const hoverThrottle =
    totalThrust > 0
      ? Math.min(
          0.95,
          Math.pow(
            weightN / totalThrust,
            1 / Math.max(0.5, tuning.thrustCurveExponent),
          ),
        )
      : 1;

  return {
    units,
    totalMaxThrustNewtons: totalThrust,
    thrustToWeight: twr,
    hoverThrottleEstimate: hoverThrottle,
    modelVersion: '1.1.1-hint-approx',
    dataProvenance: 'peak-thrust-hint-fallback',
    confidence: 'low',
    warnings,
  };
}
