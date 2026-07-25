import type { InertiaEstimate } from '../inertia/estimator';
import type { PropulsionSystemResult } from '../propulsion/solver';

export interface ControlAuthorityResult {
  readonly maxRollTorque: number;
  readonly maxPitchTorque: number;
  readonly maxYawTorque: number;
  readonly rollAcceleration: number;
  readonly pitchAcceleration: number;
  readonly yawAcceleration: number;
  readonly maxRollRate: number;
  readonly maxPitchRate: number;
  readonly maxYawRate: number;
  readonly authorityMargin: number;
}

export function analyzeControlAuthority(
  propulsion: PropulsionSystemResult,
  inertia: InertiaEstimate,
): ControlAuthorityResult {
  const units = propulsion.units;
  let rollTorque = 0;
  let pitchTorque = 0;
  let yawTorque = 0;

  for (const u of units) {
    const armY = Math.abs(u.position.y);
    const armX = Math.abs(u.position.x);
    const arm = Math.hypot(u.position.x, u.position.y);
    rollTorque += u.maxThrustNewtons * armY;
    pitchTorque += u.maxThrustNewtons * armX;
    yawTorque += u.maxThrustNewtons * arm * 0.12;
  }

  const rollAcc = rollTorque / Math.max(0.05, inertia.roll / 180);
  const pitchAcc = pitchTorque / Math.max(0.05, inertia.pitch / 180);
  const yawAcc = yawTorque / Math.max(0.05, inertia.yaw / 180);

  // Map to solver-facing rates (rad/s) similar to existing profiles.
  const maxRollRate = Math.min(12, 2.5 + rollAcc * 0.08);
  const maxPitchRate = Math.min(12, 2.4 + pitchAcc * 0.08);
  const maxYawRate = Math.min(10, 2.0 + yawAcc * 0.07);

  return {
    maxRollTorque: rollTorque,
    maxPitchTorque: pitchTorque,
    maxYawTorque: yawTorque,
    rollAcceleration: Math.min(40, rollAcc * 0.15),
    pitchAcceleration: Math.min(40, pitchAcc * 0.15),
    yawAcceleration: Math.min(35, yawAcc * 0.12),
    maxRollRate,
    maxPitchRate,
    maxYawRate,
    authorityMargin: propulsion.thrustToWeight - 1,
  };
}
