import type {
  EngineeringValidationSnapshot,
  ValidationContext,
  ValidationPolicy,
  ValidationReport,
  ValidationRule,
} from './domain/types';
import { summarizeIssues, FREE_FLIGHT_POLICY } from './domain/types';
import {
  resolutionRules,
  structuralRules,
  topologyRules,
} from './rules/structural-topology';
import {
  mechanicalRules,
  electricalRules,
  rulesetRules,
} from './rules/mechanical-electrical-ruleset';
import type { ResolvedAssembly } from '@fpv/drone-build-domain';

const PRE_ENGINEERING_PHASES = new Set([
  'resolution',
  'structural',
  'topology',
  'mechanical',
  'electrical',
  'pre-engineering-ruleset',
]);

const POST_ENGINEERING_PHASES = new Set([
  'post-engineering',
  'integrity',
]);

const DEFAULT_RULES: ValidationRule[] = [
  ...resolutionRules,
  ...structuralRules,
  ...topologyRules,
  ...mechanicalRules,
  ...electricalRules,
  ...rulesetRules,
];

export class ValidationRuleRegistry {
  private readonly rules: ValidationRule[];

  constructor(rules: ValidationRule[] = DEFAULT_RULES) {
    this.rules = [...rules];
  }

  list(): readonly ValidationRule[] {
    return this.rules;
  }

  register(rule: ValidationRule): void {
    this.rules.push(rule);
  }
}

function buildContext(
  assembly: ResolvedAssembly,
  policy: ValidationPolicy,
  engineering?: EngineeringValidationSnapshot,
): ValidationContext {
  return {
    revision: assembly.revision,
    components: assembly.selectedComponents,
    assembly,
    policy,
    engineering,
  };
}

/** Pre-engineering validation phases (resolution through ruleset). */
export function executePreEngineeringValidation(
  assembly: ResolvedAssembly,
  policy: ValidationPolicy = FREE_FLIGHT_POLICY,
  registry: ValidationRuleRegistry = new ValidationRuleRegistry(),
): ValidationReport {
  const ctx = buildContext(assembly, policy);
  const issues = registry
    .list()
    .filter((r) => PRE_ENGINEERING_PHASES.has(r.phase))
    .flatMap((rule) => rule.evaluate(ctx));
  return summarizeIssues(issues);
}

/** Post-engineering validation (mass/TWR policy, mechanical TOW with mass). */
export function executePostEngineeringValidation(
  assembly: ResolvedAssembly,
  engineering: EngineeringValidationSnapshot,
  policy: ValidationPolicy = FREE_FLIGHT_POLICY,
  registry: ValidationRuleRegistry = new ValidationRuleRegistry(),
): ValidationReport {
  const ctx = buildContext(assembly, policy, engineering);
  const issues = registry
    .list()
    .filter(
      (r) =>
        POST_ENGINEERING_PHASES.has(r.phase) ||
        (r.phase === 'mechanical' && r.code === 'MECH_MAX_RECOMMENDED_TOW'),
    )
    .flatMap((rule) => rule.evaluate(ctx));
  return summarizeIssues(issues);
}

/**
 * Full validation when engineering snapshot is already available.
 * Prefer split pre/post in the compiler pipeline.
 */
export function executeValidation(
  assembly: ResolvedAssembly,
  policy: ValidationPolicy = FREE_FLIGHT_POLICY,
  registry: ValidationRuleRegistry = new ValidationRuleRegistry(),
  engineering?: EngineeringValidationSnapshot,
): ValidationReport {
  const ctx = buildContext(assembly, policy, engineering);
  const issues = registry.list().flatMap((rule) => {
    if (!engineering && (POST_ENGINEERING_PHASES.has(rule.phase) || rule.code === 'MECH_MAX_RECOMMENDED_TOW')) {
      return [];
    }
    return rule.evaluate(ctx);
  });
  return summarizeIssues(issues);
}

export function mergeValidationReports(
  ...reports: ValidationReport[]
): ValidationReport {
  return summarizeIssues(reports.flatMap((r) => r.issues));
}

export * from './domain/types';
export * from './rules/structural-topology';
export * from './rules/mechanical-electrical-ruleset';
