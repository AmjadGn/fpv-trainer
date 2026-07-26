import { describe, expect, it } from 'vitest';
import type { MissionAircraftCapabilities } from './aircraft-capabilities';
import {
  assertNoUnsupportedAircraftConstraints,
  evaluateMissionAircraftCompatibility,
  type MissionAircraftCompatibilityPolicy,
} from './aircraft-compatibility';

function baseCapabilities(
  overrides: Partial<MissionAircraftCapabilities> = {},
): MissionAircraftCapabilities {
  return {
    aircraftId: 'aircraft-1',
    sourceType: 'factory',
    category: 'freestyle',
    widthMeters: 0.25,
    heightMeters: 0.08,
    takeoffMassKg: 0.6,
    thrustToWeight: 3.5,
    recommendedMaxSpeedMps: 25,
    hasCamera: true,
    cameraProfileCapability: { minFovDeg: 90, maxFovDeg: 150, provenance: 'runtime' },
    collisionProfileAvailable: true,
    collisionProvenance: 'runtime',
    runtimeCompatibilityVersion: '1.0.0',
    definitionVersion: '1.0.0',
    estimatedEnduranceMinutes: 6,
    ...overrides,
  };
}

describe('evaluateMissionAircraftCompatibility: baseline', () => {
  it('is compatible with no issues against an empty policy', () => {
    const result = evaluateMissionAircraftCompatibility(baseCapabilities(), {});
    expect(result.status).toBe('compatible');
    expect(result.issues).toEqual([]);
  });

  it.each(['factory', 'user-compiled'] as const)(
    'accepts sourceType "%s" identically',
    (sourceType) => {
      const result = evaluateMissionAircraftCompatibility(baseCapabilities({ sourceType }), {});
      expect(result.status).toBe('compatible');
    },
  );
});

describe('evaluateMissionAircraftCompatibility: category', () => {
  it('flags CATEGORY_PROHIBITED when the category is explicitly prohibited', () => {
    const policy: MissionAircraftCompatibilityPolicy = { prohibitedCategories: ['freestyle'] };
    const result = evaluateMissionAircraftCompatibility(
      baseCapabilities({ category: 'freestyle' }),
      policy,
    );
    expect(result.status).toBe('incompatible');
    expect(result.issues.map((issue) => issue.code)).toContain('CATEGORY_PROHIBITED');
  });

  it('flags CATEGORY_PROHIBITED when the category is absent from an allow-list', () => {
    const policy: MissionAircraftCompatibilityPolicy = { allowedCategories: ['cinematic'] };
    const result = evaluateMissionAircraftCompatibility(
      baseCapabilities({ category: 'racing' }),
      policy,
    );
    expect(result.status).toBe('incompatible');
    expect(result.issues.map((issue) => issue.code)).toContain('CATEGORY_PROHIBITED');
  });

  it('allows a category present in the allow-list', () => {
    const policy: MissionAircraftCompatibilityPolicy = {
      allowedCategories: ['freestyle', 'racing'],
    };
    const result = evaluateMissionAircraftCompatibility(
      baseCapabilities({ category: 'racing' }),
      policy,
    );
    expect(result.status).toBe('compatible');
  });
});

describe('evaluateMissionAircraftCompatibility: dimensions and mass', () => {
  it('flags DIMENSION_EXCEEDED when width exceeds the policy max', () => {
    const policy: MissionAircraftCompatibilityPolicy = { maxWidthMeters: 0.2 };
    const result = evaluateMissionAircraftCompatibility(
      baseCapabilities({ widthMeters: 0.3 }),
      policy,
    );
    expect(result.status).toBe('incompatible');
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'DIMENSION_EXCEEDED', path: 'widthMeters' }),
    );
  });

  it('flags DIMENSION_EXCEEDED when height exceeds the policy max', () => {
    const policy: MissionAircraftCompatibilityPolicy = { maxHeightMeters: 0.05 };
    const result = evaluateMissionAircraftCompatibility(
      baseCapabilities({ heightMeters: 0.1 }),
      policy,
    );
    expect(result.status).toBe('incompatible');
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'DIMENSION_EXCEEDED', path: 'heightMeters' }),
    );
  });

  it('flags MASS_EXCEEDED when takeoff mass exceeds the policy max', () => {
    const policy: MissionAircraftCompatibilityPolicy = { maxTakeoffMassKg: 0.5 };
    const result = evaluateMissionAircraftCompatibility(
      baseCapabilities({ takeoffMassKg: 0.9 }),
      policy,
    );
    expect(result.status).toBe('incompatible');
    expect(result.issues.map((issue) => issue.code)).toContain('MASS_EXCEEDED');
  });

  it('flags TWR_TOO_LOW when thrust-to-weight is below the policy minimum', () => {
    const policy: MissionAircraftCompatibilityPolicy = { minThrustToWeight: 4 };
    const result = evaluateMissionAircraftCompatibility(
      baseCapabilities({ thrustToWeight: 2 }),
      policy,
    );
    expect(result.status).toBe('incompatible');
    expect(result.issues.map((issue) => issue.code)).toContain('TWR_TOO_LOW');
  });

  it('flags SPEED_EXCEEDED when the recommended max speed exceeds the policy ceiling', () => {
    const policy: MissionAircraftCompatibilityPolicy = { maxRecommendedSpeedMps: 15 };
    const result = evaluateMissionAircraftCompatibility(
      baseCapabilities({ recommendedMaxSpeedMps: 30 }),
      policy,
    );
    expect(result.status).toBe('incompatible');
    expect(result.issues.map((issue) => issue.code)).toContain('SPEED_EXCEEDED');
  });

  it('flags INSUFFICIENT_RUNTIME_DATA (as a warning, not an error) when a constrained field is unknown', () => {
    const policy: MissionAircraftCompatibilityPolicy = { maxWidthMeters: 0.2 };
    const result = evaluateMissionAircraftCompatibility(
      baseCapabilities({ widthMeters: undefined }),
      policy,
    );
    expect(result.status).toBe('compatibleWithWarnings');
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'INSUFFICIENT_RUNTIME_DATA',
        severity: 'warning',
        path: 'widthMeters',
      }),
    );
  });
});

describe('evaluateMissionAircraftCompatibility: camera and FOV', () => {
  it('flags CAMERA_MISSING when a camera is required but absent', () => {
    const policy: MissionAircraftCompatibilityPolicy = { requireCamera: true };
    const result = evaluateMissionAircraftCompatibility(
      baseCapabilities({ hasCamera: false, cameraProfileCapability: undefined }),
      policy,
    );
    expect(result.status).toBe('incompatible');
    expect(result.issues.map((issue) => issue.code)).toContain('CAMERA_MISSING');
  });

  it('flags FOV_UNSUPPORTED when the camera FOV range does not overlap the requirement', () => {
    const policy: MissionAircraftCompatibilityPolicy = { fovRangeDeg: { min: 160, max: 170 } };
    const result = evaluateMissionAircraftCompatibility(baseCapabilities(), policy);
    expect(result.status).toBe('incompatible');
    expect(result.issues.map((issue) => issue.code)).toContain('FOV_UNSUPPORTED');
  });

  it('accepts an overlapping FOV range', () => {
    const policy: MissionAircraftCompatibilityPolicy = { fovRangeDeg: { min: 100, max: 120 } };
    const result = evaluateMissionAircraftCompatibility(baseCapabilities(), policy);
    expect(result.status).toBe('compatible');
  });

  it('surfaces TEMPLATE_DERIVED_CAMERA as a non-blocking warning', () => {
    const caps = baseCapabilities({
      cameraProfileCapability: { minFovDeg: 90, maxFovDeg: 150, provenance: 'template-derived' },
    });
    const result = evaluateMissionAircraftCompatibility(caps, {});
    expect(result.status).toBe('compatibleWithWarnings');
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'TEMPLATE_DERIVED_CAMERA', severity: 'warning' }),
    );
  });
});

describe('evaluateMissionAircraftCompatibility: collision profile', () => {
  it('flags COLLISION_PROFILE_MISSING when required but unavailable', () => {
    const policy: MissionAircraftCompatibilityPolicy = { requireCollisionProfile: true };
    const result = evaluateMissionAircraftCompatibility(
      baseCapabilities({ collisionProfileAvailable: false, collisionProvenance: undefined }),
      policy,
    );
    expect(result.status).toBe('incompatible');
    expect(result.issues.map((issue) => issue.code)).toContain('COLLISION_PROFILE_MISSING');
  });

  it('surfaces TEMPLATE_DERIVED_COLLISION as a non-blocking warning', () => {
    const caps = baseCapabilities({ collisionProvenance: 'template-derived' });
    const result = evaluateMissionAircraftCompatibility(caps, {});
    expect(result.status).toBe('compatibleWithWarnings');
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'TEMPLATE_DERIVED_COLLISION', severity: 'warning' }),
    );
  });

  it('flags INSUFFICIENT_RUNTIME_DATA when collision profile is available but provenance is unknown', () => {
    const caps = baseCapabilities({ collisionProvenance: undefined });
    const result = evaluateMissionAircraftCompatibility(caps, {});
    expect(result.status).toBe('compatibleWithWarnings');
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'INSUFFICIENT_RUNTIME_DATA', path: 'collisionProvenance' }),
    );
  });
});

describe('evaluateMissionAircraftCompatibility: runtime compatibility version', () => {
  it('flags RUNTIME_COMPAT_MISMATCH on a major-version mismatch', () => {
    const caps = baseCapabilities({ runtimeCompatibilityVersion: '2.0.0' });
    const result = evaluateMissionAircraftCompatibility(
      caps,
      {},
      {
        requiredRuntimeCompatibilityVersion: '1.0.0',
      },
    );
    expect(result.status).toBe('incompatible');
    expect(result.issues.map((issue) => issue.code)).toContain('RUNTIME_COMPAT_MISMATCH');
  });

  it('accepts a same-major runtime compatibility version', () => {
    const caps = baseCapabilities({ runtimeCompatibilityVersion: '1.4.2' });
    const result = evaluateMissionAircraftCompatibility(
      caps,
      {},
      {
        requiredRuntimeCompatibilityVersion: '1.0.0',
      },
    );
    expect(result.status).toBe('compatible');
  });

  it('flags INSUFFICIENT_RUNTIME_DATA for a malformed runtime compatibility version', () => {
    const caps = baseCapabilities({ runtimeCompatibilityVersion: 'not-a-version' });
    const result = evaluateMissionAircraftCompatibility(
      caps,
      {},
      {
        requiredRuntimeCompatibilityVersion: '1.0.0',
      },
    );
    expect(result.status).toBe('compatibleWithWarnings');
    expect(result.issues.map((issue) => issue.code)).toContain('INSUFFICIENT_RUNTIME_DATA');
  });

  it('performs no runtime-version check when the option is omitted', () => {
    const caps = baseCapabilities({ runtimeCompatibilityVersion: 'garbage' });
    const result = evaluateMissionAircraftCompatibility(caps, {});
    expect(result.status).toBe('compatible');
  });
});

describe('evaluateMissionAircraftCompatibility: unsupported constraints are always rejected', () => {
  it('rejects an endurance constraint injected via untyped/untrusted policy data', () => {
    const untrustedPolicy = {
      enduranceMinutesMin: 10,
    } as unknown as MissionAircraftCompatibilityPolicy;
    const result = evaluateMissionAircraftCompatibility(baseCapabilities(), untrustedPolicy);
    expect(result.status).toBe('incompatible');
    expect(result.issues.map((issue) => issue.code)).toContain('UNSUPPORTED_CONSTRAINT_ENDURANCE');
  });

  it('rejects a battery-consumption constraint injected via untyped/untrusted policy data', () => {
    const untrustedPolicy = {
      batteryConsumption: 1200,
    } as unknown as MissionAircraftCompatibilityPolicy;
    const result = evaluateMissionAircraftCompatibility(baseCapabilities(), untrustedPolicy);
    expect(result.status).toBe('incompatible');
    expect(result.issues.map((issue) => issue.code)).toContain('UNSUPPORTED_CONSTRAINT_ENDURANCE');
  });

  it.each([
    'buildSpecificOptics',
    'buildSpecificColliderPrecision',
    'controllerCalibrationVersion',
    'yawInverted',
    'rawAxisMapping',
  ])('rejects unsupported controller/build-specific field "%s"', (key) => {
    const untrustedPolicy = { [key]: true } as unknown as MissionAircraftCompatibilityPolicy;
    const result = evaluateMissionAircraftCompatibility(baseCapabilities(), untrustedPolicy);
    expect(result.status).toBe('incompatible');
    expect(result.issues.map((issue) => issue.code)).toContain('UNSUPPORTED_CONSTRAINT_FIELD');
  });
});

describe('assertNoUnsupportedAircraftConstraints', () => {
  it('accepts a clean, trusted policy shape', () => {
    const report = assertNoUnsupportedAircraftConstraints({
      maxWidthMeters: 0.3,
      requireCamera: true,
    });
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('rejects raw endurance/battery fields', () => {
    const report = assertNoUnsupportedAircraftConstraints({
      enduranceMinutesMin: 10,
      batteryConsumption: 1200,
    });
    expect(report.ok).toBe(false);
    expect(report.issues).toHaveLength(2);
    expect(report.issues.every((issue) => issue.code === 'UNSUPPORTED_CONSTRAINT_ENDURANCE')).toBe(
      true,
    );
  });

  it('rejects raw controller-calibration and raw-axis fields', () => {
    const report = assertNoUnsupportedAircraftConstraints({
      controllerCalibrationVersion: 3,
      yawInverted: true,
      rawAxisMapping: { throttle: 0 },
    });
    expect(report.ok).toBe(false);
    expect(report.issues).toHaveLength(3);
    expect(report.issues.every((issue) => issue.code === 'UNSUPPORTED_CONSTRAINT_FIELD')).toBe(
      true,
    );
  });

  it('handles non-object input without throwing', () => {
    expect(assertNoUnsupportedAircraftConstraints(null).ok).toBe(true);
    expect(assertNoUnsupportedAircraftConstraints('nonsense').ok).toBe(true);
    expect(assertNoUnsupportedAircraftConstraints(42).ok).toBe(true);
    expect(assertNoUnsupportedAircraftConstraints(undefined).ok).toBe(true);
  });
});
