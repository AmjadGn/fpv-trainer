/**
 * Generic validation-result contracts shared across simulation-contracts
 * modules and downstream packages that validate simulation data.
 */

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  readonly code: string;
  readonly severity: ValidationSeverity;
  readonly path: string;
  readonly entityId?: string;
  readonly message: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ValidationReport {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
}

export function createIssue(
  code: string,
  severity: ValidationSeverity,
  path: string,
  message: string,
  options?: {
    readonly entityId?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  },
): ValidationIssue {
  return {
    code,
    severity,
    path,
    message,
    ...(options?.entityId !== undefined ? { entityId: options.entityId } : {}),
    ...(options?.metadata !== undefined ? { metadata: options.metadata } : {}),
  };
}

/**
 * Builds a `ValidationReport` from a set of issues. `ok` is true iff no
 * issue has severity `'error'` — warnings and info do not fail a report.
 */
export function createReport(issues: readonly ValidationIssue[]): ValidationReport {
  return { ok: !issues.some((issue) => issue.severity === 'error'), issues };
}

/** Combines multiple reports into one, recomputing `ok` from the union of issues. */
export function mergeReports(
  reports: readonly ValidationReport[],
): ValidationReport {
  const issues = reports.flatMap((report) => report.issues);
  return createReport(issues);
}

export function reportHasErrors(report: ValidationReport): boolean {
  return report.issues.some((issue) => issue.severity === 'error');
}
