import { clamp, lerp, quantize } from '@fpv/engineering-kernel';
import type { PropulsionOperatingPoint } from '../domain/models';

export const PROPULSION_INTERPOLATION_MODEL_VERSION = '1.1.2-piecewise-linear';

export type PropulsionInterpolationAxis = 'normalizedDriveCommand';

export interface PropulsionInterpolationQuery {
  readonly axis: PropulsionInterpolationAxis;
  readonly value: number;
  /** Extrapolation disabled by default (ADR-028). */
  readonly allowExtrapolation?: boolean;
  readonly clampToEnvelope?: boolean;
}

export interface PropulsionInterpolationResult {
  readonly modelVersion: string;
  readonly thrustN: number;
  readonly currentA: number | null;
  readonly powerW: number | null;
  readonly rpm: number | null;
  readonly torqueNm: number | null;
  readonly efficiency: number | null;
  readonly voltageV: number;
  readonly command: number;
  readonly interval: {
    readonly lowerPointId: string;
    readonly upperPointId: string;
    readonly t: number;
  } | null;
  readonly clamped: boolean;
  readonly extrapolated: boolean;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly warnings: readonly string[];
}

function q(n: number): number {
  return quantize(n);
}

function lerpNullable(
  a: number | null,
  b: number | null,
  t: number,
): number | null {
  if (a === null || b === null) return null;
  return q(lerp(a, b, t));
}

/**
 * Piecewise-linear interpolation along normalizedDriveCommand.
 *
 * Inputs: validated, command-sorted operating points; query command in [0,1]
 *   (or outside when clamping).
 * Outputs: SI thrust (N), current (A), power (W), RPM, torque (N·m).
 * Valid range: between min and max command of the dataset envelope.
 * Assumptions: linear segments between adjacent measured points; no hidden
 *   extrapolation; floating-point results quantized for stability.
 * Failure: empty points throw; out-of-envelope clamps when enabled, else warns
 *   and clamps with reduced confidence.
 * Confidence: high for exact/interior; medium when clamped; low if incomplete.
 * Model version: PROPULSION_INTERPOLATION_MODEL_VERSION.
 */
export function interpolatePropulsionOperatingPoint(
  points: readonly PropulsionOperatingPoint[],
  query: PropulsionInterpolationQuery,
): PropulsionInterpolationResult {
  const warnings: string[] = [];
  if (points.length === 0) {
    throw new Error('Cannot interpolate empty operating-point collection');
  }
  if (query.axis !== 'normalizedDriveCommand') {
    throw new Error(`Unsupported interpolation axis: ${query.axis}`);
  }

  const ordered = [...points].sort(
    (a, b) => a.normalizedDriveCommand - b.normalizedDriveCommand,
  );
  const minCmd = ordered[0].normalizedDriveCommand;
  const maxCmd = ordered[ordered.length - 1].normalizedDriveCommand;
  const allowExtrapolation = query.allowExtrapolation === true;
  const clampToEnvelope = query.clampToEnvelope !== false;

  let command = query.value;
  let clamped = false;
  let extrapolated = false;

  if (command < minCmd || command > maxCmd) {
    if (allowExtrapolation) {
      extrapolated = true;
      warnings.push('PROP_INTERP_EXTRAPOLATED');
    } else if (clampToEnvelope) {
      command = clamp(command, minCmd, maxCmd);
      clamped = command !== query.value;
      if (clamped) warnings.push('PROP_INTERP_CLAMPED_TO_ENVELOPE');
    } else {
      warnings.push('PROP_INTERP_OUTSIDE_ENVELOPE');
      command = clamp(command, minCmd, maxCmd);
      clamped = true;
    }
  }

  // Exact point lookup
  for (const p of ordered) {
    if (p.normalizedDriveCommand === command) {
      return {
        modelVersion: PROPULSION_INTERPOLATION_MODEL_VERSION,
        thrustN: q(p.staticThrustN),
        currentA: p.currentA === null ? null : q(p.currentA),
        powerW: p.electricalPowerW === null ? null : q(p.electricalPowerW),
        rpm: p.rpm === null ? null : q(p.rpm),
        torqueNm: p.torqueNm === null ? null : q(p.torqueNm),
        efficiency: p.efficiency === null ? null : q(p.efficiency),
        voltageV: q(p.voltageV),
        command: q(command),
        interval: {
          lowerPointId: p.pointId,
          upperPointId: p.pointId,
          t: 0,
        },
        clamped,
        extrapolated,
        confidence: clamped || extrapolated ? 'medium' : 'high',
        warnings,
      };
    }
  }

  let lower = ordered[0];
  let upper = ordered[ordered.length - 1];
  for (let i = 0; i < ordered.length - 1; i++) {
    if (
      ordered[i].normalizedDriveCommand <= command &&
      command <= ordered[i + 1].normalizedDriveCommand
    ) {
      lower = ordered[i];
      upper = ordered[i + 1];
      break;
    }
  }

  const span = upper.normalizedDriveCommand - lower.normalizedDriveCommand;
  const t = span === 0 ? 0 : (command - lower.normalizedDriveCommand) / span;
  const tq = q(t);

  return {
    modelVersion: PROPULSION_INTERPOLATION_MODEL_VERSION,
    thrustN: q(lerp(lower.staticThrustN, upper.staticThrustN, tq)),
    currentA: lerpNullable(lower.currentA, upper.currentA, tq),
    powerW: lerpNullable(lower.electricalPowerW, upper.electricalPowerW, tq),
    rpm: lerpNullable(lower.rpm, upper.rpm, tq),
    torqueNm: lerpNullable(lower.torqueNm, upper.torqueNm, tq),
    efficiency: lerpNullable(lower.efficiency, upper.efficiency, tq),
    voltageV: q(lerp(lower.voltageV, upper.voltageV, tq)),
    command: q(command),
    interval: {
      lowerPointId: lower.pointId,
      upperPointId: upper.pointId,
      t: tq,
    },
    clamped,
    extrapolated,
    confidence: clamped || extrapolated ? 'medium' : 'high',
    warnings,
  };
}
