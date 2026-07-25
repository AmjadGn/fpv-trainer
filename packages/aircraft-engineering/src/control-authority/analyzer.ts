import type { InertiaEstimate } from '../inertia/estimator';
import type { PropulsionSystemResult } from '../propulsion/solver';

/**
 * Physical control-authority estimate using SI inertia (kg·m²) and thrust (N).
 * Torque in N·m; angular acceleration in rad/s².
 * Solver-facing rate clamps belong in @fpv/aircraft-runtime-adapter.
 */
export interface ControlAuthorityResult {
  readonly maxRollTorque: number;
  readonly maxPitchTorque: number;
  readonly maxYawTorque: number;
  readonly rollAcceleration: number;
  readonly pitchAcceleration: number;
  readonly yawAcceleration: number;
  /** Unclamped physical estimate of achievable rate (rad/s) from authority margin. */
  readonly maxRollRate: number;
  readonly maxPitchRate: number;
  readonly maxYawRate: number;
  readonly authorityMargin: number;
  readonly units: {
    readonly torque: 'N·m';
    readonly angularAcceleration: 'rad/s²';
    readonly angularRate: 'rad/s';
  };
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

  const rollAcc = rollTorque / Math.max(1e-8, inertia.roll);
  const pitchAcc = pitchTorque / Math.max(1e-8, inertia.pitch);
  const yawAcc = yawTorque / Math.max(1e-8, inertia.yaw);

  // Physical rate estimates from acceleration capability (no solver clamps).
  const maxRollRate = Math.sqrt(Math.max(0, 2 * rollAcc * (Math.PI / 2)));
  const maxPitchRate = Math.sqrt(Math.max(0, 2 * pitchAcc * (Math.PI / 2)));
  const maxYawRate = Math.sqrt(Math.max(0, 2 * yawAcc * (Math.PI / 3)));

  return {
    maxRollTorque: rollTorque,
    maxPitchTorque: pitchTorque,
    maxYawTorque: yawTorque,
    rollAcceleration: rollAcc,
    pitchAcceleration: pitchAcc,
    yawAcceleration: yawAcc,
    maxRollRate,
    maxPitchRate,
    maxYawRate,
    authorityMargin: propulsion.thrustToWeight - 1,
    units: {
      torque: 'N·m',
      angularAcceleration: 'rad/s²',
      angularRate: 'rad/s',
    },
  };
}
