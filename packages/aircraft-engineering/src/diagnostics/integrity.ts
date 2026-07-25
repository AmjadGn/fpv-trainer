import { isFinitePositive, isFiniteNonNegative } from '@fpv/engineering-kernel';
import type { MassBreakdown } from '../mass/aggregator';
import type { InertiaEstimate } from '../inertia/estimator';
import type { PropulsionSystemResult } from '../propulsion/solver';
import type { ElectricalSystemResult } from '../electrical/solver';

export interface IntegrityIssue {
  readonly code: string;
  readonly message: string;
  readonly fatal: boolean;
}

export function validateEngineeringIntegrity(input: {
  mass: MassBreakdown;
  inertia: InertiaEstimate;
  propulsion: PropulsionSystemResult;
  electrical: ElectricalSystemResult;
}): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  if (!isFinitePositive(input.mass.totalTakeoffMassKg)) {
    issues.push({
      code: 'INT_MASS',
      message: 'Total mass must be finite and positive',
      fatal: true,
    });
  }
  for (const axis of ['roll', 'pitch', 'yaw'] as const) {
    if (!isFinitePositive(input.inertia[axis])) {
      issues.push({
        code: 'INT_INERTIA',
        message: `Inertia ${axis} invalid`,
        fatal: true,
      });
    }
  }
  if (!isFinitePositive(input.propulsion.totalMaxThrustNewtons)) {
    issues.push({
      code: 'INT_THRUST',
      message: 'Total thrust must be positive',
      fatal: true,
    });
  }
  for (const u of input.propulsion.units) {
    let prev = -1;
    for (const sample of u.thrustCurve) {
      if (!isFiniteNonNegative(sample.thrustNewtons)) {
        issues.push({
          code: 'INT_CURVE',
          message: 'Thrust curve has non-finite values',
          fatal: true,
        });
        break;
      }
      if (sample.thrustNewtons + 1e-9 < prev) {
        issues.push({
          code: 'INT_CURVE_MONOTONIC',
          message: 'Thrust curve must be non-decreasing with throttle',
          fatal: false,
        });
      }
      prev = sample.thrustNewtons;
    }
  }
  if (
    input.electrical.nominalVoltage > 0 &&
    !isFinitePositive(input.electrical.nominalVoltage)
  ) {
    issues.push({
      code: 'INT_VOLTAGE',
      message: 'Invalid nominal voltage',
      fatal: true,
    });
  }

  return issues;
}
