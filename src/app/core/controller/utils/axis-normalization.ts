import {
  AxisCalibration,
  CalibratedFlightInput,
  ControllerCalibration,
  DEFAULT_CENTERED_DEADZONE,
  FlightChannel,
} from '../models/controller-calibration.model';
import { AxisState } from '../models/controller-state.model';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Normalize a centered stick axis (yaw / pitch / roll).
 * Each side of center is scaled independently, then inversion,
 * clamp, and deadzone rescaling are applied.
 */
export function normalizeCenteredAxis(
  rawValue: number,
  calibration: AxisCalibration,
): number {
  const { min, center, max, inverted, deadzone } = calibration;
  let normalized: number;

  if (rawValue >= center) {
    const span = max - center;
    normalized = span > 1e-9 ? (rawValue - center) / span : 0;
  } else {
    const span = center - min;
    normalized = span > 1e-9 ? (rawValue - center) / span : 0;
  }

  if (inverted) {
    normalized = -normalized;
  }

  normalized = clamp(normalized, -1, 1);

  const dz = clamp(deadzone, 0, 0.95);
  if (Math.abs(normalized) <= dz) {
    return 0;
  }

  const sign = Math.sign(normalized);
  return sign * ((Math.abs(normalized) - dz) / (1 - dz));
}

/**
 * Normalize throttle from min→0 / max→1 (no centered deadzone).
 */
export function normalizeThrottleAxis(
  rawValue: number,
  calibration: AxisCalibration,
): number {
  const { min, max, inverted } = calibration;
  const span = max - min;
  let normalized = span > 1e-9 ? (rawValue - min) / span : 0;

  if (inverted) {
    normalized = 1 - normalized;
  }

  return clamp(normalized, 0, 1);
}

export function normalizeFlightChannel(
  channel: FlightChannel,
  rawValue: number,
  calibration: AxisCalibration,
): number {
  if (channel === 'throttle') {
    return normalizeThrottleAxis(rawValue, calibration);
  }

  return normalizeCenteredAxis(rawValue, calibration);
}

export function computeCalibratedFlightInput(
  calibration: ControllerCalibration,
  axes: ReadonlyArray<Pick<AxisState, 'index' | 'rawValue'>>,
): CalibratedFlightInput {
  const byIndex = new Map(axes.map((axis) => [axis.index, axis.rawValue]));

  const read = (channel: FlightChannel): number => {
    const axisCal = calibration.channels[channel];
    const raw = byIndex.get(axisCal.axisIndex);
    if (raw === undefined) {
      return channel === 'throttle' ? 0 : 0;
    }
    return normalizeFlightChannel(channel, raw, axisCal);
  };

  return {
    throttle: read('throttle'),
    yaw: read('yaw'),
    pitch: read('pitch'),
    roll: read('roll'),
  };
}

export function average(values: ReadonlyArray<number>): number {
  if (values.length === 0) {
    return 0;
  }

  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

export function median(values: ReadonlyArray<number>): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }

  return sorted[mid]!;
}

export function maxAbsoluteDeviation(
  values: ReadonlyArray<number>,
  reference: number,
): number {
  let max = 0;
  for (const value of values) {
    max = Math.max(max, Math.abs(value - reference));
  }
  return max;
}

export function createDefaultAxisCalibration(
  axisIndex: number,
  overrides: Partial<AxisCalibration> = {},
): AxisCalibration {
  return {
    axisIndex,
    min: -1,
    center: 0,
    max: 1,
    inverted: false,
    deadzone: DEFAULT_CENTERED_DEADZONE,
    ...overrides,
  };
}

export function findStrongestMovedAxis(
  baselines: ReadonlyArray<number>,
  samples: ReadonlyArray<ReadonlyArray<number>>,
  excludedAxes: ReadonlySet<number>,
  movementThreshold: number,
): { axisIndex: number; delta: number } | null {
  if (baselines.length === 0 || samples.length === 0) {
    return null;
  }

  let bestIndex = -1;
  let bestDelta = 0;

  for (let axisIndex = 0; axisIndex < baselines.length; axisIndex++) {
    if (excludedAxes.has(axisIndex)) {
      continue;
    }

    const baseline = baselines[axisIndex] ?? 0;
    let peak = 0;

    for (const sample of samples) {
      const value = sample[axisIndex];
      if (value === undefined) {
        continue;
      }
      peak = Math.max(peak, Math.abs(value - baseline));
    }

    if (peak > bestDelta) {
      bestDelta = peak;
      bestIndex = axisIndex;
    }
  }

  if (bestIndex < 0 || bestDelta < movementThreshold) {
    return null;
  }

  return { axisIndex: bestIndex, delta: bestDelta };
}

export function isControllerCalibration(
  value: unknown,
): value is ControllerCalibration {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record['version'] !== 'number' ||
    typeof record['controllerId'] !== 'string' ||
    typeof record['controllerMapping'] !== 'string' ||
    typeof record['createdAt'] !== 'string' ||
    typeof record['updatedAt'] !== 'string' ||
    !record['channels'] ||
    typeof record['channels'] !== 'object'
  ) {
    return false;
  }

  const channels = record['channels'] as Record<string, unknown>;
  for (const channel of ['throttle', 'yaw', 'pitch', 'roll'] as const) {
    if (!isAxisCalibration(channels[channel])) {
      return false;
    }
  }

  return true;
}

function isAxisCalibration(value: unknown): value is AxisCalibration {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const axis = value as Record<string, unknown>;
  return (
    typeof axis['axisIndex'] === 'number' &&
    typeof axis['min'] === 'number' &&
    typeof axis['center'] === 'number' &&
    typeof axis['max'] === 'number' &&
    typeof axis['inverted'] === 'boolean' &&
    typeof axis['deadzone'] === 'number'
  );
}
