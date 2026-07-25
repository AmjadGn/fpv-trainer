import type { ComponentRevision } from '@fpv/component-catalog';
import type { DroneBuildRevision } from '@fpv/drone-build-domain';

export type ValidationSeverity = 'info' | 'warning' | 'error' | 'fatal';

export interface ValidationIssue {
  readonly ruleCode: string;
  readonly severity: ValidationSeverity;
  readonly messageKey: string;
  readonly relatedSelectionIds: readonly string[];
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly affectedPath: string;
  readonly remediationKeys: readonly string[];
}

export interface ValidationReport {
  readonly issues: readonly ValidationIssue[];
  readonly hasFatal: boolean;
  readonly hasError: boolean;
  readonly hasWarning: boolean;
  readonly canCompile: boolean;
}

export interface ValidationContext {
  readonly revision: DroneBuildRevision;
  readonly components: ReadonlyMap<string, ComponentRevision>;
  readonly policy: ValidationPolicy;
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
  policyVersion: '1.1.0',
  maxTakeoffMassKg: null,
  allowedComponentSources: ['official', 'community', 'marketplace', 'private-local'],
  requireOfficialCatalog: false,
  minThrustToWeight: 1.2,
  maxCellCount: null,
  maxPropDiameterM: null,
};

export const RANKED_RACING_POLICY: ValidationPolicy = {
  policyId: 'ranked-racing',
  policyVersion: '1.1.0',
  maxTakeoffMassKg: 0.85,
  allowedComponentSources: ['official'],
  requireOfficialCatalog: true,
  minThrustToWeight: 2.0,
  maxCellCount: 6,
  maxPropDiameterM: 0.132,
};

export type ValidationRule = {
  readonly code: string;
  readonly phase:
    | 'structural'
    | 'mechanical'
    | 'electrical'
    | 'propulsion'
    | 'stability'
    | 'ruleset';
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
