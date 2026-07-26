import { describe, expect, it } from 'vitest';
import {
  asElapsedTicks,
  asSimulationTick,
  createAabb,
  createAltitudeRange,
  createCameraProjection,
  createFixedStepDuration,
  createIssue,
  createNormalizedScreenRectangle,
  createObb,
  createReport,
  createSphere,
  IDENTITY_QUAT,
  isCompatibleMajor,
  isExactVersion,
  isFiniteCameraProjection,
  isFiniteNumber,
  isFiniteVec3,
  isUnitQuat,
  MISSION_CAPTURE_ASPECT_RATIO,
  mergeReports,
  parseMajorMinorPatch,
  PROJECTION_MODEL_VERSION,
  reportHasErrors,
  secondsToTicks,
  SIMULATOR_COORDINATE_SYSTEM_V1,
  ticksToSeconds,
  ZERO_VEC3,
  type ValidationIssue,
} from './index';

describe('math: finite-value validation', () => {
  it('accepts ordinary finite numbers', () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(-42.5)).toBe(true);
  });

  it('rejects NaN and Infinity without throwing', () => {
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it('validates Vec3 finiteness component-wise', () => {
    expect(isFiniteVec3(ZERO_VEC3)).toBe(true);
    expect(isFiniteVec3({ x: 1, y: Number.NaN, z: 3 })).toBe(false);
    expect(isFiniteVec3({ x: Number.POSITIVE_INFINITY, y: 0, z: 0 })).toBe(false);
  });

  it('validates unit quaternions within an epsilon and does not throw on bad input', () => {
    expect(isUnitQuat(IDENTITY_QUAT)).toBe(true);
    expect(isUnitQuat({ x: 0, y: 0, z: 0, w: 1.00001 })).toBe(true);
    expect(isUnitQuat({ x: 0, y: 0, z: 0, w: 2 })).toBe(false);
    expect(isUnitQuat({ x: Number.NaN, y: 0, z: 0, w: 1 })).toBe(false);
  });
});

describe('time: tick behavior', () => {
  it('brands non-negative integers as ticks', () => {
    const tick = asSimulationTick(120);
    expect(tick as unknown as number).toBe(120);
  });

  it('rejects negative or non-integer tick values', () => {
    expect(() => asSimulationTick(-1)).toThrow();
    expect(() => asSimulationTick(1.5)).toThrow();
    expect(() => asElapsedTicks(-1)).toThrow();
  });

  it('requires a positive finite fixed-step duration', () => {
    expect(() => createFixedStepDuration(0)).toThrow();
    expect(() => createFixedStepDuration(-1 / 60)).toThrow();
    expect(() => createFixedStepDuration(Number.NaN)).toThrow();
    expect(createFixedStepDuration(1 / 60)).toBeCloseTo(1 / 60);
  });

  it('converts ticks to seconds linearly', () => {
    const step = createFixedStepDuration(1 / 100);
    const ticks = asElapsedTicks(50);
    expect(ticksToSeconds(ticks, step)).toBeCloseTo(0.5);
  });

  it('converts seconds to ticks using a floor policy', () => {
    const step = createFixedStepDuration(1 / 100); // 0.01s per tick
    // 0.049s / 0.01s = 4.9 ticks -> floors to 4, never rounds up past budget
    expect(secondsToTicks(0.049, step) as unknown as number).toBe(4);
    // exact multiples convert cleanly
    expect(secondsToTicks(0.05, step) as unknown as number).toBe(5);
    // zero seconds is zero ticks
    expect(secondsToTicks(0, step) as unknown as number).toBe(0);
  });

  it('rejects negative seconds for secondsToTicks', () => {
    const step = createFixedStepDuration(1 / 100);
    expect(() => secondsToTicks(-0.01, step)).toThrow();
  });
});

describe('coordinate-system: authoritative convention', () => {
  it('describes +X right, +Y up, -Z forward, right-handed, meters, body-to-world', () => {
    expect(SIMULATOR_COORDINATE_SYSTEM_V1.handedness).toBe('right');
    expect(SIMULATOR_COORDINATE_SYSTEM_V1.worldRight).toEqual({ x: 1, y: 0, z: 0 });
    expect(SIMULATOR_COORDINATE_SYSTEM_V1.worldUp).toEqual({ x: 0, y: 1, z: 0 });
    expect(SIMULATOR_COORDINATE_SYSTEM_V1.aircraftForward).toEqual({ x: 0, y: 0, z: -1 });
    expect(SIMULATOR_COORDINATE_SYSTEM_V1.aircraftUp).toEqual({ x: 0, y: 1, z: 0 });
    expect(SIMULATOR_COORDINATE_SYSTEM_V1.aircraftRight).toEqual({ x: 1, y: 0, z: 0 });
    expect(SIMULATOR_COORDINATE_SYSTEM_V1.distanceUnit).toBe('meters');
    expect(SIMULATOR_COORDINATE_SYSTEM_V1.orientationConvention).toBe('body-to-world');
    expect(SIMULATOR_COORDINATE_SYSTEM_V1.version).toBe('1.0.0');
  });

  it('does NOT mention controller axes, gamepad, inversion, or calibration semantics', () => {
    const keys = Object.keys(SIMULATOR_COORDINATE_SYSTEM_V1).map((k) => k.toLowerCase());
    const serialized = JSON.stringify(SIMULATOR_COORDINATE_SYSTEM_V1).toLowerCase();
    const forbiddenTerms = ['controller', 'gamepad', 'inverted', 'inversion', 'calibration', 'yaw'];

    for (const term of forbiddenTerms) {
      expect(keys.some((k) => k.includes(term))).toBe(false);
      expect(serialized.includes(term)).toBe(false);
    }
  });
});

describe('spatial: normalized screen rectangles', () => {
  it('constructs a valid rectangle', () => {
    const result = createNormalizedScreenRectangle(0, 0, 1, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ minU: 0, minV: 0, maxU: 1, maxV: 1 });
    }
  });

  it('rejects inverted bounds', () => {
    const result = createNormalizedScreenRectangle(0.8, 0, 0.2, 1);
    expect(result.ok).toBe(false);
  });

  it('rejects non-finite bounds', () => {
    const result = createNormalizedScreenRectangle(0, 0, Number.NaN, 1);
    expect(result.ok).toBe(false);
  });
});

describe('spatial: spatial-bound construction', () => {
  it('constructs a valid sphere', () => {
    const result = createSphere({ x: 1, y: 2, z: 3 }, 5);
    expect(result.ok).toBe(true);
  });

  it('rejects a sphere with a negative radius', () => {
    const result = createSphere({ x: 0, y: 0, z: 0 }, -1);
    expect(result.ok).toBe(false);
  });

  it('constructs a valid AABB and rejects an inverted one', () => {
    const valid = createAabb({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    expect(valid.ok).toBe(true);

    const inverted = createAabb({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 1 });
    expect(inverted.ok).toBe(false);
  });

  it('constructs a valid OBB and rejects negative half-extents', () => {
    const valid = createObb({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, IDENTITY_QUAT);
    expect(valid.ok).toBe(true);

    const invalid = createObb({ x: 0, y: 0, z: 0 }, { x: -1, y: 1, z: 1 }, IDENTITY_QUAT);
    expect(invalid.ok).toBe(false);
  });

  it('constructs a valid altitude range and rejects an inverted one', () => {
    const valid = createAltitudeRange(0, 120);
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.value).toEqual({ minMeters: 0, maxMeters: 120 });
    }

    const inverted = createAltitudeRange(120, 0);
    expect(inverted.ok).toBe(false);

    const nonFinite = createAltitudeRange(Number.NaN, 10);
    expect(nonFinite.ok).toBe(false);
  });
});

describe('camera: projection validation', () => {
  it('constructs a valid projection with defaulted model version', () => {
    const result = createCameraProjection(90, 16 / 9, 0.1, 1000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectionModelVersion).toBe(PROJECTION_MODEL_VERSION);
      expect(isFiniteCameraProjection(result.value)).toBe(true);
    }
  });

  it('rejects an out-of-range vertical FOV', () => {
    expect(createCameraProjection(0, 16 / 9, 0.1, 1000).ok).toBe(false);
    expect(createCameraProjection(180, 16 / 9, 0.1, 1000).ok).toBe(false);
    expect(createCameraProjection(-10, 16 / 9, 0.1, 1000).ok).toBe(false);
  });

  it('rejects a non-positive aspect ratio', () => {
    expect(createCameraProjection(90, 0, 0.1, 1000).ok).toBe(false);
    expect(createCameraProjection(90, -1, 0.1, 1000).ok).toBe(false);
  });

  it('rejects far <= near', () => {
    expect(createCameraProjection(90, 16 / 9, 10, 10).ok).toBe(false);
    expect(createCameraProjection(90, 16 / 9, 10, 5).ok).toBe(false);
  });

  it('exposes the stable mission-capture aspect ratio constant as 16:9', () => {
    expect(MISSION_CAPTURE_ASPECT_RATIO).toBeCloseTo(16 / 9);
  });
});

describe('validation report helpers', () => {
  it('creates a passing report with no error-severity issues', () => {
    const issues: ValidationIssue[] = [
      createIssue('W001', 'warning', 'camera.fov', 'FOV is unusually wide'),
    ];
    const report = createReport(issues);
    expect(report.ok).toBe(true);
    expect(reportHasErrors(report)).toBe(false);
  });

  it('creates a failing report when any issue is an error', () => {
    const issues: ValidationIssue[] = [
      createIssue('E001', 'error', 'camera.nearMeters', 'near must be positive', {
        entityId: 'camera-1',
        metadata: { nearMeters: -1 },
      }),
    ];
    const report = createReport(issues);
    expect(report.ok).toBe(false);
    expect(reportHasErrors(report)).toBe(true);
  });

  it('merges multiple reports, preserving all issues and error status', () => {
    const passing = createReport([]);
    const failing = createReport([createIssue('E002', 'error', 'a', 'bad')]);
    const merged = mergeReports([passing, failing]);
    expect(merged.issues).toHaveLength(1);
    expect(merged.ok).toBe(false);
  });
});

describe('versioning helpers', () => {
  it('validates exact major.minor.patch strings', () => {
    expect(isExactVersion('1.0.0')).toBe(true);
    expect(isExactVersion('1.0')).toBe(false);
    expect(isExactVersion('v1.0.0')).toBe(false);
  });

  it('parses well-formed version strings and rejects malformed ones', () => {
    expect(parseMajorMinorPatch('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseMajorMinorPatch('not-a-version')).toBeNull();
  });

  it('checks major-version compatibility', () => {
    expect(isCompatibleMajor('1.2.3', '1.9.0')).toBe(true);
    expect(isCompatibleMajor('1.2.3', '2.0.0')).toBe(false);
    expect(isCompatibleMajor('bad', '1.0.0')).toBe(false);
  });
});
