/**
 * Small, shared, dependency-light helpers used by both
 * `validateLocationDefinition` and `validateMissionDefinition`. Every
 * helper here is defensive against untyped/untrusted input (raw JSON cast
 * to a domain type) — none of them throw.
 */

import { createIssue, isExactVersion, isFiniteNumber, type ValidationIssue } from '@fpv/simulation-contracts';

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Stringifies a (possibly branded-string) id for cross-package comparison/Set membership, without tripping TS "no overlap" checks on incompatible brands. */
export function idStr(value: unknown): string {
  return typeof value === 'string' ? value : String(value);
}

const CHECKSUM_HEX_PATTERN = /^[a-fA-F0-9]{64}$/;

export function isValidSha256Checksum(checksum: unknown): boolean {
  if (typeof checksum !== 'object' || checksum === null) {
    return false;
  }
  const record = checksum as Record<string, unknown>;
  return record['algorithm'] === 'sha256' && typeof record['hex'] === 'string' && CHECKSUM_HEX_PATTERN.test(record['hex']);
}

/**
 * Checks a collection of items for empty/duplicate id-like values, pushing
 * `EMPTY_ID` / `DUPLICATE_ID` issues. `idOf` extracts the raw (possibly
 * malformed) id value from each item; `pathOf` builds the issue path.
 */
export function checkIdsUniqueAndNonEmpty<T>(
  items: readonly T[],
  idOf: (item: T, index: number) => unknown,
  pathOf: (item: T, index: number) => string,
  issues: ValidationIssue[],
  duplicateCode = 'DUPLICATE_ID',
  emptyCode = 'EMPTY_ID',
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const rawId = idOf(item, index);
    const path = pathOf(item, index);
    if (!isNonEmptyString(rawId)) {
      issues.push(createIssue(emptyCode, 'error', path, `Expected a non-empty string id at "${path}", got: ${JSON.stringify(rawId)}`));
      return;
    }
    if (seen.has(rawId)) {
      issues.push(createIssue(duplicateCode, 'error', path, `Duplicate id "${rawId}" at "${path}"`, { entityId: rawId }));
      return;
    }
    seen.add(rawId);
  });
}

export function checkExactVersionField(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isNonEmptyString(value) || !isExactVersion(value)) {
    issues.push(
      createIssue('INVALID_VERSION', 'error', path, `"${path}" must be an exact major.minor.patch version string, got: ${JSON.stringify(value)}`),
    );
  }
}

/** Pushes `NEGATIVE_PERFORMANCE_ESTIMATE` when `value` is present but not a finite number `>= 0`. */
export function checkNonNegativeEstimateIfDefined(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'number' || !isFiniteNumber(value) || value < 0) {
    issues.push(
      createIssue('NEGATIVE_PERFORMANCE_ESTIMATE', 'error', path, `"${path}" must be a finite number >= 0 when present, got: ${JSON.stringify(value)}`),
    );
  }
}
