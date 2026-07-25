import { DEFAULT_CENTERED_DEADZONE } from '../models/controller-calibration.model';
import type {
  AxisCalibration,
  ControllerCalibration,
} from '../models/controller-calibration.model';
import {
  clamp,
  computeCalibratedFlightInput,
  createDefaultAxisCalibration,
  findStrongestMovedAxis,
  normalizeCenteredAxis,
  normalizeThrottleAxis,
} from './axis-normalization';

describe('axis-normalization helpers', () => {
  describe('normalizeCenteredAxis', () => {
    it('maps center to 0 and extremes to ±1', () => {
      const cal = createDefaultAxisCalibration(0, {
        min: -1,
        center: 0,
        max: 1,
        deadzone: 0,
      });

      expect(normalizeCenteredAxis(0, cal)).toBe(0);
      expect(normalizeCenteredAxis(-1, cal)).toBe(-1);
      expect(normalizeCenteredAxis(1, cal)).toBe(1);
    });

    it('normalizes asymmetric centers independently per side', () => {
      const cal = createDefaultAxisCalibration(0, {
        min: -0.8,
        center: 0.2,
        max: 1,
        deadzone: 0,
      });

      expect(normalizeCenteredAxis(0.2, cal)).toBe(0);
      expect(normalizeCenteredAxis(-0.8, cal)).toBeCloseTo(-1);
      expect(normalizeCenteredAxis(1, cal)).toBeCloseTo(1);
      expect(normalizeCenteredAxis(0.6, cal)).toBeCloseTo(0.5);
    });

    it('applies deadzone and rescales outside it', () => {
      const cal = createDefaultAxisCalibration(0, {
        min: -1,
        center: 0,
        max: 1,
        deadzone: 0.2,
      });

      expect(normalizeCenteredAxis(0.1, cal)).toBe(0);
      expect(normalizeCenteredAxis(-0.15, cal)).toBe(0);
      expect(normalizeCenteredAxis(0.6, cal)).toBeCloseTo(0.5);
      expect(normalizeCenteredAxis(1, cal)).toBeCloseTo(1);
    });

    it('applies inversion after normalization', () => {
      const cal = createDefaultAxisCalibration(0, {
        min: -1,
        center: 0,
        max: 1,
        inverted: true,
        deadzone: 0,
      });

      expect(normalizeCenteredAxis(1, cal)).toBeCloseTo(-1);
      expect(normalizeCenteredAxis(-0.5, cal)).toBeCloseTo(0.5);
    });

    it('clamps output to -1..1', () => {
      const cal = createDefaultAxisCalibration(0, {
        min: -0.5,
        center: 0,
        max: 0.5,
        deadzone: 0,
      });

      expect(normalizeCenteredAxis(2, cal)).toBe(1);
      expect(normalizeCenteredAxis(-2, cal)).toBe(-1);
    });
  });

  describe('normalizeThrottleAxis', () => {
    it('maps min to 0 and max to 1', () => {
      const cal = createDefaultAxisCalibration(0, {
        min: -1,
        center: -1,
        max: 1,
        deadzone: 0,
      });

      expect(normalizeThrottleAxis(-1, cal)).toBe(0);
      expect(normalizeThrottleAxis(1, cal)).toBe(1);
      expect(normalizeThrottleAxis(0, cal)).toBeCloseTo(0.5);
    });

    it('applies inversion for throttle', () => {
      const cal = createDefaultAxisCalibration(0, {
        min: 0,
        center: 0,
        max: 1,
        inverted: true,
        deadzone: 0,
      });

      expect(normalizeThrottleAxis(0, cal)).toBe(1);
      expect(normalizeThrottleAxis(1, cal)).toBe(0);
      expect(normalizeThrottleAxis(0.25, cal)).toBeCloseTo(0.75);
    });

    it('clamps throttle to 0..1', () => {
      const cal = createDefaultAxisCalibration(0, {
        min: 0,
        center: 0,
        max: 1,
        deadzone: 0,
      });

      expect(normalizeThrottleAxis(-0.5, cal)).toBe(0);
      expect(normalizeThrottleAxis(1.5, cal)).toBe(1);
    });
  });

  describe('findStrongestMovedAxis', () => {
    it('selects the strongest moved axis', () => {
      const result = findStrongestMovedAxis(
        [0, 0, 0, 0],
        [
          [0.1, 0, 0.2, 0],
          [0.2, 0, 0.9, 0],
        ],
        new Set(),
        0.35,
      );

      expect(result).toEqual({ axisIndex: 2, delta: 0.9 });
    });

    it('ignores excluded axes', () => {
      const result = findStrongestMovedAxis(
        [0, 0, 0, 0],
        [[0.9, 0.8, 0.1, 0]],
        new Set([0]),
        0.35,
      );

      expect(result).toEqual({ axisIndex: 1, delta: 0.8 });
    });

    it('rejects insufficient movement', () => {
      const result = findStrongestMovedAxis(
        [0, 0, 0, 0],
        [[0.1, 0.2, 0.05, 0.01]],
        new Set(),
        0.35,
      );

      expect(result).toBeNull();
    });

    it('prevents duplicate assignment via exclusion', () => {
      const first = findStrongestMovedAxis(
        [0, 0, 0, 0],
        [[0.9, 0.7, 0, 0]],
        new Set(),
        0.35,
      );
      expect(first?.axisIndex).toBe(0);

      const second = findStrongestMovedAxis(
        [0, 0, 0, 0],
        [[0.9, 0.7, 0, 0]],
        new Set([first!.axisIndex]),
        0.35,
      );
      expect(second?.axisIndex).toBe(1);
    });
  });

  describe('computeCalibratedFlightInput', () => {
    it('computes live calibrated values from raw axes', () => {
      const calibration: ControllerCalibration = {
        version: 1,
        controllerId: 'DJI Virtual Joystick',
        controllerMapping: 'none',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        channels: {
          throttle: axis(1, -1, -1, 1, false, 0),
          yaw: axis(0, -1, 0, 1, false, 0),
          pitch: axis(3, -1, 0, 1, false, 0),
          roll: axis(2, -1, 0, 1, false, 0),
        },
      };

      const input = computeCalibratedFlightInput(calibration, [
        { index: 0, rawValue: 0.5 },
        { index: 1, rawValue: 0 },
        { index: 2, rawValue: -0.5 },
        { index: 3, rawValue: 1 },
      ]);

      expect(input.yaw).toBeCloseTo(0.5);
      expect(input.throttle).toBeCloseTo(0.5);
      expect(input.roll).toBeCloseTo(-0.5);
      expect(input.pitch).toBeCloseTo(1);
    });
  });

  it('clamp limits values', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-2, -1, 1)).toBe(-1);
    expect(clamp(0.25, 0, 1)).toBe(0.25);
  });

  it('uses the default centered deadzone constant', () => {
    expect(DEFAULT_CENTERED_DEADZONE).toBeCloseTo(0.03);
  });
});

function axis(
  axisIndex: number,
  min: number,
  center: number,
  max: number,
  inverted: boolean,
  deadzone: number,
): AxisCalibration {
  return { axisIndex, min, center, max, inverted, deadzone };
}
