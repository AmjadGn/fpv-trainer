/**
 * Composite mission-vs-context compatibility check: aircraft capability
 * evaluation (aircraft-compatibility.ts) plus the mission's location
 * version range requirement.
 */

import type { MissionAircraftCapabilities } from './aircraft-capabilities';
import {
  evaluateMissionAircraftCompatibility,
  type CompatibilityIssue,
  type MissionAircraftCompatibilityStatus,
} from './aircraft-compatibility';
import type { MissionDefinition } from './mission-definition';

export interface MissionCompatibilityContext {
  readonly aircraftCapabilities: MissionAircraftCapabilities;
  /** Content version of the location currently loaded/selected, if known. */
  readonly locationVersion?: number;
}

export interface MissionCompatibilityCheckResult {
  readonly status: MissionAircraftCompatibilityStatus;
  readonly issues: readonly CompatibilityIssue[];
}

function statusFromIssues(
  issues: readonly CompatibilityIssue[],
): MissionAircraftCompatibilityStatus {
  if (issues.some((issue) => issue.severity === 'error')) {
    return 'incompatible';
  }
  if (issues.some((issue) => issue.severity === 'warning')) {
    return 'compatibleWithWarnings';
  }
  return 'compatible';
}

/**
 * Checks whether `mission` is compatible with the given runtime context
 * (currently: aircraft capabilities and, optionally, location content
 * version). Composes `evaluateMissionAircraftCompatibility` with the
 * mission's own `compatibilityVersion` and `locationVersionRange`.
 */
export function checkMissionCompatibility(
  mission: MissionDefinition,
  ctx: MissionCompatibilityContext,
): MissionCompatibilityCheckResult {
  const aircraftResult = evaluateMissionAircraftCompatibility(
    ctx.aircraftCapabilities,
    mission.aircraftCompatibilityPolicy,
    { requiredRuntimeCompatibilityVersion: mission.compatibilityVersion },
  );

  const issues: CompatibilityIssue[] = [...aircraftResult.issues];

  if (ctx.locationVersion !== undefined) {
    const { min, max } = mission.locationVersionRange;
    if (ctx.locationVersion < min || ctx.locationVersion > max) {
      issues.push({
        code: 'LOCATION_VERSION_OUT_OF_RANGE',
        severity: 'error',
        path: 'locationVersion',
        expected: `${min}-${max}`,
        actual: ctx.locationVersion,
      });
    }
  }

  return { status: statusFromIssues(issues), issues };
}
