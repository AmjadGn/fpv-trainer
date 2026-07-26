/**
 * Minimal version-string helpers, deliberately free of any external semver
 * dependency. Only the checks simulation-contracts consumers need:
 * exact-match, same-major compatibility, and parsing.
 */

export type VersionString = `${number}.${number}.${number}` | string;

export interface MajorMinorPatch {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Parses a strict `major.minor.patch` version string.
 * Returns `null` if `raw` does not match the pattern (non-throwing, so
 * callers can accumulate validation issues instead of catching).
 */
export function parseMajorMinorPatch(raw: string): MajorMinorPatch | null {
  const match = VERSION_PATTERN.exec(raw);
  if (!match) {
    return null;
  }
  const [, majorRaw, minorRaw, patchRaw] = match;
  if (majorRaw === undefined || minorRaw === undefined || patchRaw === undefined) {
    return null;
  }
  return {
    major: Number.parseInt(majorRaw, 10),
    minor: Number.parseInt(minorRaw, 10),
    patch: Number.parseInt(patchRaw, 10),
  };
}

/** Whether `raw` is a well-formed `major.minor.patch` version string. */
export function isExactVersion(raw: string): boolean {
  return VERSION_PATTERN.test(raw);
}

/**
 * Whether two version strings share the same major version.
 * Returns false if either string fails to parse.
 */
export function isCompatibleMajor(a: string, b: string): boolean {
  const parsedA = parseMajorMinorPatch(a);
  const parsedB = parseMajorMinorPatch(b);
  if (!parsedA || !parsedB) {
    return false;
  }
  return parsedA.major === parsedB.major;
}
