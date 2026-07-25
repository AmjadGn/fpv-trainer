import type {
  ResolvedAssembly,
  DroneBuildRevision,
} from '@fpv/drone-build-domain';
import type { ComponentRevision } from '@fpv/component-catalog';

export type ValidationSeverity = 'info' | 'warning' | 'error' | 'fatal';

export type ValidationPhase =
  | 'resolution'
  | 'structural'
  | 'topology'
  | 'mechanical'
  | 'electrical'
  | 'pre-engineering-ruleset'
  | 'engineering-calculation'
  | 'post-engineering'
  | 'integrity';

export interface ValidationIssue {
  readonly ruleCode: string;
  readonly severity: ValidationSeverity;
  readonly messageKey: string;
  readonly relatedSelectionIds: readonly string[];
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly affectedPath: string;
  readonly remediationKeys: readonly string[];
  readonly phase: ValidationPhase;
}

export interface ValidationReport {
  readonly issues: readonly ValidationIssue[];
  readonly hasFatal: boolean;
  readonly hasError: boolean;
  readonly hasWarning: boolean;
  readonly canCompile: boolean;
}

/** Minimal post-engineering inputs — avoids depending on aircraft-engineering. */
export interface EngineeringValidationSnapshot {
  readonly totalTakeoffMassKg: number;
  readonly thrustToWeight: number;
}

export interface ValidationContext {
  readonly revision: DroneBuildRevision;
  /** @deprecated Prefer assembly.selectedComponents. */
  readonly components: ReadonlyMap<string, ComponentRevision>;
  readonly assembly: ResolvedAssembly;
  readonly policy: ValidationPolicy;
  readonly engineering?: EngineeringValidationSnapshot;
}

export interface ValidationPolicy {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly maxTakeoffMassKg: number | null;
  readonly allowedComponentSources: readonly string[];
  readonly requireOfficialCatalog: boolean;
  readonly minThrustToWeight: number;
  readonly maxCellCount: number | null;
  readonly maxPropDiameterM: number | null;
}

export const FREE_FLIGHT_POLICY: ValidationPolicy = {
  policyId: 'free-flight',
  policyVersion: '1.1.1',
  maxTakeoffMassKg: null,
  allowedComponentSources: ['official', 'community', 'marketplace', 'private-local'],
  requireOfficialCatalog: false,
  minThrustToWeight: 1.2,
  maxCellCount: null,
  maxPropDiameterM: null,
};

export const RANKED_RACING_POLICY: ValidationPolicy = {
  policyId: 'ranked-racing',
  policyVersion: '1.1.1',
  maxTakeoffMassKg: 0.85,
  allowedComponentSources: ['official'],
  requireOfficialCatalog: true,
  minThrustToWeight: 2.0,
  maxCellCount: 6,
  maxPropDiameterM: 0.132,
};

export type ValidationRule = {
  readonly code: string;
  readonly phase: ValidationPhase;
  readonly evaluate: (ctx: ValidationContext) => ValidationIssue[];
};

export function summarizeIssues(issues: readonly ValidationIssue[]): ValidationReport {
  const hasFatal = issues.some((i) => i.severity === 'fatal');
  const hasError = issues.some((i) => i.severity === 'error');
  const hasWarning = issues.some((i) => i.severity === 'warning');
  return {
    issues,
    hasFatal,
    hasError,
    hasWarning,
    canCompile: !hasFatal && !hasError,
  };
}

export function issue(
  ruleCode: string,
  severity: ValidationIssue['severity'],
  messageKey: string,
  phase: ValidationPhase,
  relatedSelectionIds: string[] = [],
  parameters: Record<string, string | number | boolean> = {},
  affectedPath = 'build',
  remediationKeys: string[] = [],
): ValidationIssue {
  return {
    ruleCode,
    severity,
    messageKey,
    relatedSelectionIds,
    parameters,
    affectedPath,
    remediationKeys,
    phase,
  };
}
