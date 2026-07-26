/**
 * Runtime compatibility check for a `LocationDefinition`.
 *
 * Two independent checks, both required for compatibility:
 *  1. Coordinate system version — the location was authored against a
 *     specific coordinate-system convention version; a runtime on a
 *     different version cannot safely interpret its poses/shapes.
 *  2. Runtime compatibility version — the running simulator must be at
 *     least the location's declared minimum, on the same major version
 *     (mirrors `isCompatibleMajor` semantics from `@fpv/simulation-contracts`).
 */

import {
  createIssue,
  parseMajorMinorPatch,
  type ValidationIssue,
} from '@fpv/simulation-contracts';
import type { LocationDefinition } from './location-definition';

export interface LocationRuntimeInfo {
  readonly runtimeCompatibilityVersion: string;
  readonly coordinateSystemVersion: string;
}

export type LocationCompatibilityResult =
  | { readonly status: 'compatible' }
  | { readonly status: 'incompatible'; readonly issues: readonly ValidationIssue[] };

/**
 * Whether `runtimeVersion` satisfies a `minVersion` requirement: same major
 * version, and minor/patch at or above the minimum.
 */
function satisfiesMinimumVersion(minVersion: string, runtimeVersion: string): boolean {
  const min = parseMajorMinorPatch(minVersion);
  const runtime = parseMajorMinorPatch(runtimeVersion);
  if (!min || !runtime) {
    return false;
  }
  if (min.major !== runtime.major) {
    return false;
  }
  if (runtime.minor !== min.minor) {
    return runtime.minor > min.minor;
  }
  return runtime.patch >= min.patch;
}

/**
 * Checks whether `location` can safely run under `runtime`. Returns
 * `'incompatible'` with one issue per failed check rather than throwing —
 * callers (e.g. a location loader) decide how to surface incompatibility.
 */
export function checkLocationCompatibility(
  location: LocationDefinition,
  runtime: LocationRuntimeInfo,
): LocationCompatibilityResult {
  const issues: ValidationIssue[] = [];

  if (location.coordinateSystem.version !== runtime.coordinateSystemVersion) {
    issues.push(
      createIssue(
        'LOCATION_COORDINATE_SYSTEM_VERSION_MISMATCH',
        'error',
        'coordinateSystem.version',
        `Location "${location.identity.locationId}" was authored against coordinate system version ` +
          `"${location.coordinateSystem.version}" but the runtime is on "${runtime.coordinateSystemVersion}".`,
        {
          entityId: location.identity.locationId,
          metadata: {
            locationCoordinateSystemVersion: location.coordinateSystem.version,
            runtimeCoordinateSystemVersion: runtime.coordinateSystemVersion,
          },
        },
      ),
    );
  }

  const minRuntimeVersion = location.runtimeCompatibility.minRuntimeCompatibilityVersion;
  if (!satisfiesMinimumVersion(minRuntimeVersion, runtime.runtimeCompatibilityVersion)) {
    issues.push(
      createIssue(
        'LOCATION_RUNTIME_VERSION_INCOMPATIBLE',
        'error',
        'runtimeCompatibility.minRuntimeCompatibilityVersion',
        `Location "${location.identity.locationId}" requires runtime compatibility version >= ` +
          `"${minRuntimeVersion}" (same major) but the runtime reports "${runtime.runtimeCompatibilityVersion}".`,
        {
          entityId: location.identity.locationId,
          metadata: {
            minRuntimeCompatibilityVersion: minRuntimeVersion,
            runtimeCompatibilityVersion: runtime.runtimeCompatibilityVersion,
          },
        },
      ),
    );
  }

  if (issues.length > 0) {
    return { status: 'incompatible', issues };
  }
  return { status: 'compatible' };
}
