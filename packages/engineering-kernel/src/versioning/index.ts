export interface SemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export function parseVersion(raw: string): SemanticVersion {
  const parts = raw.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error(`Invalid semantic version: ${raw}`);
  }
  return { major: parts[0], minor: parts[1], patch: parts[2] };
}

export function formatVersion(v: SemanticVersion): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

export function versionEquals(a: SemanticVersion, b: SemanticVersion): boolean {
  return a.major === b.major && a.minor === b.minor && a.patch === b.patch;
}

/** Full version manifest for reproducible compilation. */
export interface VersionManifest {
  readonly buildSchemaVersion: string;
  readonly componentSchemaVersion: string;
  readonly catalogReleaseVersion: string;
  readonly validationRulesVersion: string;
  readonly engineeringModelVersion: string;
  readonly aerodynamicModelVersion: string;
  readonly propulsionModelVersion: string;
  readonly compilerVersion: string;
  readonly runtimeAdapterVersion: string;
  readonly flightModelCompatibilityVersion: string;
}

/**
 * v1.1.2 — propulsion performance dataset architecture:
 * - propulsionModelVersion 1.1.2: dataset matching, interpolation, fallback metadata
 * - engineeringModelVersion / compilerVersion 1.1.2: compiled propulsion source fields
 * - validationRulesVersion 1.1.2: dataset eligibility policy in compilation context
 * - runtimeAdapterVersion / flightModelCompatibilityVersion unchanged — runtime mapping
 *   still consumes compiled totals/curves through the same adapter path
 */
export const V1_1_VERSION_MANIFEST: VersionManifest = {
  buildSchemaVersion: '1.1.0',
  componentSchemaVersion: '1.1.0',
  catalogReleaseVersion: '1.1.0',
  validationRulesVersion: '1.1.2',
  engineeringModelVersion: '1.1.2',
  aerodynamicModelVersion: '1.1.0',
  propulsionModelVersion: '1.1.2',
  compilerVersion: '1.1.2',
  runtimeAdapterVersion: '1.1.1',
  flightModelCompatibilityVersion: '1.0.0',
};
