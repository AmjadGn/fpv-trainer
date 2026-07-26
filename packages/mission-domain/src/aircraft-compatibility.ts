/**
 * Mission-vs-aircraft compatibility evaluation.
 *
 * Only "trusted" constraints — things derivable from an aircraft's
 * normalized runtime capabilities — are representable in
 * `MissionAircraftCompatibilityPolicy`. Endurance minutes, battery
 * consumption, build-specific optics/collider precision, and anything
 * about controller calibration/inversion/raw axis mapping are explicitly
 * UNSUPPORTED: the policy type has no fields for them, and
 * `evaluateMissionAircraftCompatibility` defensively rejects any such keys
 * that show up anyway (e.g. because a caller bypassed the type system by
 * parsing untrusted JSON as `MissionAircraftCompatibilityPolicy`).
 *
 * `assertNoUnsupportedAircraftConstraints` is exported separately so an
 * upstream validation package can reject these fields even earlier, at
 * raw-parse time, before a policy object is ever constructed.
 */

import {
  createIssue,
  createReport,
  isCompatibleMajor,
  isExactVersion,
  type ValidationIssue,
  type ValidationReport,
} from '@fpv/simulation-contracts';
import type { CapabilityProvenance, MissionAircraftCapabilities } from './aircraft-capabilities';

/** An inclusive field-of-view range, in degrees. */
export interface FovRangeDeg {
  readonly min: number;
  readonly max: number;
}

/**
 * Trusted, structurally-typed aircraft compatibility constraints for a
 * mission. Deliberately omits endurance and any controller/calibration
 * concept — see module doc comment.
 */
export interface MissionAircraftCompatibilityPolicy {
  readonly allowedCategories?: readonly string[];
  readonly prohibitedCategories?: readonly string[];
  readonly maxWidthMeters?: number;
  readonly maxHeightMeters?: number;
  readonly maxTakeoffMassKg?: number;
  readonly minThrustToWeight?: number;
  readonly maxRecommendedSpeedMps?: number;
  readonly requireCamera?: boolean;
  readonly fovRangeDeg?: FovRangeDeg;
  readonly requireCollisionProfile?: boolean;
  /** Advisory only — does not gate compatibility, surfaced for UI recommendation lists. */
  readonly recommendedAircraftIds?: readonly string[];
  /** Advisory only — does not gate compatibility, surfaced for UI recommendation lists. */
  readonly recommendedCategories?: readonly string[];
}

export type CompatibilityIssueSeverity = 'error' | 'warning';

export type CompatibilityIssueCode =
  | 'CATEGORY_PROHIBITED'
  | 'DIMENSION_EXCEEDED'
  | 'MASS_EXCEEDED'
  | 'TWR_TOO_LOW'
  | 'SPEED_EXCEEDED'
  | 'CAMERA_MISSING'
  | 'FOV_UNSUPPORTED'
  | 'COLLISION_PROFILE_MISSING'
  | 'RUNTIME_COMPAT_MISMATCH'
  | 'TEMPLATE_DERIVED_CAMERA'
  | 'TEMPLATE_DERIVED_COLLISION'
  | 'UNSUPPORTED_CONSTRAINT_ENDURANCE'
  | 'UNSUPPORTED_CONSTRAINT_FIELD'
  | 'INSUFFICIENT_RUNTIME_DATA'
  /** Emitted by `checkMissionCompatibility` (compatibility.ts), not by this module. */
  | 'LOCATION_VERSION_OUT_OF_RANGE';

export interface CompatibilityIssue {
  readonly code: CompatibilityIssueCode;
  readonly severity: CompatibilityIssueSeverity;
  readonly expected?: string | number | boolean;
  readonly actual?: string | number | boolean;
  readonly path: string;
  readonly provenance?: CapabilityProvenance;
}

export type MissionAircraftCompatibilityStatus =
  'compatible' | 'compatibleWithWarnings' | 'incompatible';

export interface MissionAircraftCompatibilityResult {
  readonly status: MissionAircraftCompatibilityStatus;
  readonly issues: readonly CompatibilityIssue[];
}

export interface EvaluateAircraftCompatibilityOptions {
  /**
   * The mission's required runtime-compatibility surface (typically
   * `MissionDefinition.compatibilityVersion`). When provided, it is
   * compared against `capabilities.runtimeCompatibilityVersion` using
   * major-version compatibility; a mismatch produces
   * `RUNTIME_COMPAT_MISMATCH`. Omitted entirely, no runtime-version check
   * is performed.
   */
  readonly requiredRuntimeCompatibilityVersion?: string;
}

/** Battery/endurance-flavored keys that must never gate compatibility. */
const ENDURANCE_UNSUPPORTED_KEYS = ['enduranceMinutesMin', 'batteryConsumption'] as const;

/** Raw controller/build-specific keys that must never gate compatibility. */
const FIELD_UNSUPPORTED_KEYS = [
  'buildSpecificOptics',
  'buildSpecificColliderPrecision',
  'controllerCalibrationVersion',
  'yawInverted',
  'rawAxisMapping',
] as const;

const ALL_UNSUPPORTED_KEYS: readonly string[] = [
  ...ENDURANCE_UNSUPPORTED_KEYS,
  ...FIELD_UNSUPPORTED_KEYS,
];

function insufficientData(path: string): CompatibilityIssue {
  return {
    code: 'INSUFFICIENT_RUNTIME_DATA',
    severity: 'warning',
    path,
    provenance: 'insufficient',
  };
}

/**
 * Defensively scans a policy object (which may have arrived via `as`-cast
 * untrusted data, bypassing the `MissionAircraftCompatibilityPolicy` type)
 * for unsupported constraint keys, pushing an error-severity issue for
 * each one found. This guarantees `evaluateMissionAircraftCompatibility`
 * never silently honors a hard endurance/battery/controller constraint.
 */
function scanForUnsupportedConstraints(
  policy: MissionAircraftCompatibilityPolicy,
  issues: CompatibilityIssue[],
): void {
  const record = policy as unknown as Readonly<Record<string, unknown>>;
  for (const key of ENDURANCE_UNSUPPORTED_KEYS) {
    if (record[key] !== undefined) {
      issues.push({ code: 'UNSUPPORTED_CONSTRAINT_ENDURANCE', severity: 'error', path: key });
    }
  }
  for (const key of FIELD_UNSUPPORTED_KEYS) {
    if (record[key] !== undefined) {
      issues.push({ code: 'UNSUPPORTED_CONSTRAINT_FIELD', severity: 'error', path: key });
    }
  }
}

/**
 * Validates a raw (untyped) aircraft-compatibility policy payload — e.g.
 * freshly parsed JSON, before it is trusted as
 * `MissionAircraftCompatibilityPolicy` — and rejects any unsupported
 * endurance/battery/controller-calibration/raw-axis field. Intended for
 * use by an upstream mission-content validation package, ahead of
 * `evaluateMissionAircraftCompatibility`'s own defensive checks.
 */
export function assertNoUnsupportedAircraftConstraints(raw: unknown): ValidationReport {
  if (raw === null || typeof raw !== 'object') {
    return createReport([]);
  }
  const record = raw as Readonly<Record<string, unknown>>;
  const issues: ValidationIssue[] = [];
  for (const key of ALL_UNSUPPORTED_KEYS) {
    if (record[key] !== undefined) {
      const isEndurance = (ENDURANCE_UNSUPPORTED_KEYS as readonly string[]).includes(key);
      issues.push(
        createIssue(
          isEndurance ? 'UNSUPPORTED_CONSTRAINT_ENDURANCE' : 'UNSUPPORTED_CONSTRAINT_FIELD',
          'error',
          key,
          `Aircraft compatibility policy field "${key}" is not supported. Mission aircraft ` +
            'snapshots are already-normalized authoritative state; endurance/battery figures ' +
            'are informational-only and raw controller/calibration data must never reach ' +
            'mission-domain.',
        ),
      );
    }
  }
  return createReport(issues);
}

function evaluateCategory(
  capabilities: MissionAircraftCapabilities,
  policy: MissionAircraftCompatibilityPolicy,
  issues: CompatibilityIssue[],
): void {
  if (policy.prohibitedCategories?.includes(capabilities.category)) {
    issues.push({
      code: 'CATEGORY_PROHIBITED',
      severity: 'error',
      path: 'category',
      expected: `not "${capabilities.category}"`,
      actual: capabilities.category,
    });
    return;
  }
  if (policy.allowedCategories && !policy.allowedCategories.includes(capabilities.category)) {
    issues.push({
      code: 'CATEGORY_PROHIBITED',
      severity: 'error',
      path: 'category',
      expected: policy.allowedCategories.join('|'),
      actual: capabilities.category,
    });
  }
}

function evaluateNumericCeiling(
  path: string,
  code: CompatibilityIssueCode,
  actual: number | undefined,
  ceiling: number | undefined,
  issues: CompatibilityIssue[],
): void {
  if (ceiling === undefined) {
    return;
  }
  if (actual === undefined) {
    issues.push(insufficientData(path));
    return;
  }
  if (actual > ceiling) {
    issues.push({ code, severity: 'error', path, expected: ceiling, actual });
  }
}

function evaluateThrustToWeight(
  capabilities: MissionAircraftCapabilities,
  policy: MissionAircraftCompatibilityPolicy,
  issues: CompatibilityIssue[],
): void {
  if (policy.minThrustToWeight === undefined) {
    return;
  }
  if (capabilities.thrustToWeight === undefined) {
    issues.push(insufficientData('thrustToWeight'));
    return;
  }
  if (capabilities.thrustToWeight < policy.minThrustToWeight) {
    issues.push({
      code: 'TWR_TOO_LOW',
      severity: 'error',
      path: 'thrustToWeight',
      expected: policy.minThrustToWeight,
      actual: capabilities.thrustToWeight,
    });
  }
}

function evaluateCamera(
  capabilities: MissionAircraftCapabilities,
  policy: MissionAircraftCompatibilityPolicy,
  issues: CompatibilityIssue[],
): void {
  if (policy.requireCamera && !capabilities.hasCamera) {
    issues.push({
      code: 'CAMERA_MISSING',
      severity: 'error',
      path: 'hasCamera',
      expected: true,
      actual: false,
    });
  }

  if (policy.fovRangeDeg === undefined) {
    // No FOV constraint, but still surface template-derived provenance as
    // an informational warning so downstream UIs can flag it.
    if (
      capabilities.hasCamera &&
      capabilities.cameraProfileCapability?.provenance === 'template-derived'
    ) {
      issues.push({
        code: 'TEMPLATE_DERIVED_CAMERA',
        severity: 'warning',
        path: 'cameraProfileCapability',
        provenance: 'template-derived',
      });
    }
    return;
  }

  if (!capabilities.hasCamera) {
    // CAMERA_MISSING already reported above when required; if the camera
    // isn't required but a FOV range is still declared, we simply cannot
    // verify it.
    if (!policy.requireCamera) {
      issues.push(insufficientData('cameraProfileCapability'));
    }
    return;
  }

  if (!capabilities.cameraProfileCapability) {
    issues.push(insufficientData('cameraProfileCapability'));
    return;
  }

  const cap = capabilities.cameraProfileCapability;
  const outOfRange =
    cap.maxFovDeg < policy.fovRangeDeg.min || cap.minFovDeg > policy.fovRangeDeg.max;
  if (outOfRange) {
    issues.push({
      code: 'FOV_UNSUPPORTED',
      severity: 'error',
      path: 'cameraProfileCapability',
      expected: `${policy.fovRangeDeg.min}-${policy.fovRangeDeg.max}`,
      actual: `${cap.minFovDeg}-${cap.maxFovDeg}`,
    });
  }
  if (cap.provenance === 'template-derived') {
    issues.push({
      code: 'TEMPLATE_DERIVED_CAMERA',
      severity: 'warning',
      path: 'cameraProfileCapability',
      provenance: 'template-derived',
    });
  }
}

function evaluateCollisionProfile(
  capabilities: MissionAircraftCapabilities,
  policy: MissionAircraftCompatibilityPolicy,
  issues: CompatibilityIssue[],
): void {
  if (policy.requireCollisionProfile && !capabilities.collisionProfileAvailable) {
    issues.push({
      code: 'COLLISION_PROFILE_MISSING',
      severity: 'error',
      path: 'collisionProfileAvailable',
      expected: true,
      actual: false,
    });
  }
  if (!capabilities.collisionProfileAvailable) {
    return;
  }
  if (capabilities.collisionProvenance === 'template-derived') {
    issues.push({
      code: 'TEMPLATE_DERIVED_COLLISION',
      severity: 'warning',
      path: 'collisionProvenance',
      provenance: 'template-derived',
    });
  } else if (capabilities.collisionProvenance === undefined) {
    issues.push(insufficientData('collisionProvenance'));
  }
}

function evaluateRuntimeCompatibilityVersion(
  capabilities: MissionAircraftCapabilities,
  options: EvaluateAircraftCompatibilityOptions,
  issues: CompatibilityIssue[],
): void {
  const required = options.requiredRuntimeCompatibilityVersion;
  if (required === undefined) {
    return;
  }
  if (!isExactVersion(required) || !isExactVersion(capabilities.runtimeCompatibilityVersion)) {
    issues.push(insufficientData('runtimeCompatibilityVersion'));
    return;
  }
  if (!isCompatibleMajor(required, capabilities.runtimeCompatibilityVersion)) {
    issues.push({
      code: 'RUNTIME_COMPAT_MISMATCH',
      severity: 'error',
      path: 'runtimeCompatibilityVersion',
      expected: required,
      actual: capabilities.runtimeCompatibilityVersion,
    });
  }
}

/**
 * Evaluates whether `capabilities` satisfies `policy`. Pure and total —
 * never throws; unsatisfiable/unknown-shaped inputs surface as issues
 * (`INSUFFICIENT_RUNTIME_DATA`) rather than exceptions.
 */
export function evaluateMissionAircraftCompatibility(
  capabilities: MissionAircraftCapabilities,
  policy: MissionAircraftCompatibilityPolicy,
  options: EvaluateAircraftCompatibilityOptions = {},
): MissionAircraftCompatibilityResult {
  const issues: CompatibilityIssue[] = [];

  scanForUnsupportedConstraints(policy, issues);
  evaluateCategory(capabilities, policy, issues);
  evaluateNumericCeiling(
    'widthMeters',
    'DIMENSION_EXCEEDED',
    capabilities.widthMeters,
    policy.maxWidthMeters,
    issues,
  );
  evaluateNumericCeiling(
    'heightMeters',
    'DIMENSION_EXCEEDED',
    capabilities.heightMeters,
    policy.maxHeightMeters,
    issues,
  );
  evaluateNumericCeiling(
    'takeoffMassKg',
    'MASS_EXCEEDED',
    capabilities.takeoffMassKg,
    policy.maxTakeoffMassKg,
    issues,
  );
  evaluateNumericCeiling(
    'recommendedMaxSpeedMps',
    'SPEED_EXCEEDED',
    capabilities.recommendedMaxSpeedMps,
    policy.maxRecommendedSpeedMps,
    issues,
  );
  evaluateThrustToWeight(capabilities, policy, issues);
  evaluateCamera(capabilities, policy, issues);
  evaluateCollisionProfile(capabilities, policy, issues);
  evaluateRuntimeCompatibilityVersion(capabilities, options, issues);

  const hasError = issues.some((issue) => issue.severity === 'error');
  if (hasError) {
    return { status: 'incompatible', issues };
  }
  const hasWarning = issues.some((issue) => issue.severity === 'warning');
  return { status: hasWarning ? 'compatibleWithWarnings' : 'compatible', issues };
}
