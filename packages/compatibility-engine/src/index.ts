import type {
  ValidationContext,
  ValidationPolicy,
  ValidationReport,
  ValidationRule,
} from './domain/types';
import { summarizeIssues, FREE_FLIGHT_POLICY } from './domain/types';
import {
  structuralRules,
  mechanicalRules,
  electricalRules,
  rulesetRules,
} from './rules/core-rules';
import type { ComponentRevision } from '@fpv/component-catalog';
import type { DroneBuildRevision } from '@fpv/drone-build-domain';

const DEFAULT_RULES: ValidationRule[] = [
  ...structuralRules,
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

export function executeValidation(
  revision: DroneBuildRevision,
  components: ReadonlyMap<string, ComponentRevision>,
  policy: ValidationPolicy = FREE_FLIGHT_POLICY,
  registry: ValidationRuleRegistry = new ValidationRuleRegistry(),
): ValidationReport {
  const ctx: ValidationContext = { revision, components, policy };
  const issues = registry.list().flatMap((rule) => rule.evaluate(ctx));
  return summarizeIssues(issues);
}

export * from './domain/types';
export * from './rules/core-rules';
