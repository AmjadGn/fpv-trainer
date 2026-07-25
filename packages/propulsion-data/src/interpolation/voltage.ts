/**
 * Voltage handling model for propulsion datasets (v1.1.2).
 *
 * Distinguishes:
 * - batteryNominalVoltage — catalog battery.nominalVoltage
 * - batteryFullyChargedVoltage — catalog battery.maxVoltage
 * - loadedSaggedVoltage — electrical.estimatedVoltageSag applied (future)
 * - datasetTestVoltage — dataset.testVoltageV
 * - interpolatedOperatingVoltage — from operating-point interpolation
 *
 * v1.1.2 policy (ADR-029):
 * - Exact-voltage datasets only by default (within exactVoltageToleranceV).
 * - Voltage interpolation between two datasets is gated by
 *   voltageInterpolationAllowed (disabled in Free Flight / Ranked presets).
 * - No silent linear thrust∝V scaling. Legacy peakThrustHint fallback retains
 *   its documented voltageFactor (nominalVoltage / 14.8 V reference) with
 *   explicit low confidence — that path is not a measured voltage model.
 *
 * Model version: 1.1.2-exact-voltage
 */

export const PROPULSION_VOLTAGE_MODEL_VERSION = '1.1.2-exact-voltage';

export interface VoltageCompatibilityInput {
  readonly batteryNominalVoltageV: number;
  readonly datasetTestVoltageV: number;
  readonly toleranceV: number;
}

export function voltagesCompatible(input: VoltageCompatibilityInput): boolean {
  return (
    Number.isFinite(input.batteryNominalVoltageV) &&
    Number.isFinite(input.datasetTestVoltageV) &&
    Math.abs(input.batteryNominalVoltageV - input.datasetTestVoltageV) <=
      input.toleranceV
  );
}

/**
 * Legacy fallback voltage factor — documented approximation only.
 * Inputs: battery nominal voltage (V).
 * Output: dimensionless scale clamped to [0.5, 1.6].
 * Reference: 14.8 V (4S nominal).
 * Confidence effect: always low when used with peakThrustHint.
 */
export function legacyVoltageFactor(nominalVoltageV: number): number {
  const raw = nominalVoltageV / 14.8;
  return Math.max(0.5, Math.min(1.6, raw));
}
