import type { ComponentType } from '@fpv/component-catalog';
import type { ValidationSeverity } from '@fpv/compatibility-engine';

/** Explicit builder lifecycle — avoid independent boolean flags. */
export type BuilderPhase =
  | 'idle'
  | 'loadingCatalog'
  | 'editing'
  | 'validating'
  | 'invalid'
  | 'valid'
  | 'saving'
  | 'saved'
  | 'compiling'
  | 'compiled'
  | 'compileFailed'
  | 'launching';

export type BuilderMode = 'simple' | 'advanced';

export type BuildIntentId =
  | 'racing'
  | 'freestyle'
  | 'cinematic'
  | 'long-range';

/** Product guidance only — never bypasses validation or engineering. */
export interface BuildIntentProfile {
  readonly id: BuildIntentId;
  readonly title: string;
  readonly shortDescription: string;
  readonly plainLanguageGoal: string;
  /** Factory aircraft used as the recommended starting point. */
  readonly recommendedFactoryAircraftId: string;
  readonly recommendedCategoryOrder: readonly ComponentType[];
}

export type CompatibilityIssueClass =
  | 'blocking-error'
  | 'warning'
  | 'recommendation'
  | 'information';

export interface BuilderCompatibilityIssueView {
  readonly issueClass: CompatibilityIssueClass;
  readonly title: string;
  readonly explanation: string;
  readonly suggestedAction: string;
  readonly affectedCategory: ComponentType | 'build' | 'unknown';
  readonly relatedSelectionIds: readonly string[];
  /** Advanced diagnostics only. */
  readonly domainCode: string;
  readonly severity: ValidationSeverity;
}

export type EngineeringStatSourceLabel =
  | 'Measured'
  | 'Curated synthetic'
  | 'Estimated'
  | 'Legacy fallback'
  | 'Unavailable';

export type EngineeringStatConfidenceLabel = 'high' | 'medium' | 'low' | 'unavailable';

export interface BuilderEngineeringStatView {
  readonly id: string;
  readonly label: string;
  readonly simpleLabel: string;
  readonly value: number | string | null;
  readonly unit: string;
  readonly confidence: EngineeringStatConfidenceLabel;
  readonly source: EngineeringStatSourceLabel;
  readonly limitations: string;
  /** Advanced mode only. */
  readonly advancedOnly: boolean;
}

export interface BuilderComponentOptionView {
  readonly revisionId: string;
  readonly name: string;
  readonly category: ComponentType;
  readonly recommendedUse: string;
  readonly compatibilityStatus: 'compatible' | 'warning' | 'incompatible' | 'unknown';
  readonly simplePerformanceEffect: string;
  readonly massKg: number | null;
  readonly revision: string;
  readonly physicalSummary: string;
  readonly electricalSummary: string;
  readonly dataConfidence: EngineeringStatConfidenceLabel;
  readonly dataSource: EngineeringStatSourceLabel;
  readonly warnings: readonly string[];
}

export interface BuilderCompileResultView {
  readonly ok: boolean;
  readonly aircraftId: string | null;
  readonly aircraftDisplayName: string | null;
  readonly buildFingerprint: string | null;
  readonly artifactFingerprint: string | null;
  readonly blockingIssues: readonly BuilderCompatibilityIssueView[];
  readonly warnings: readonly BuilderCompatibilityIssueView[];
  readonly message: string;
}

export interface BuilderSessionSnapshot {
  readonly phase: BuilderPhase;
  readonly mode: BuilderMode;
  readonly intentId: BuildIntentId | null;
  readonly buildId: string | null;
  readonly buildName: string;
  readonly dirty: boolean;
  readonly activeCategory: ComponentType;
  readonly selectedRevisionIdsBySlot: Readonly<Record<string, string>>;
  readonly canCompile: boolean;
  readonly compileBlockedReason: string | null;
  readonly lastCompile: BuilderCompileResultView | null;
  readonly launchAircraftName: string | null;
}
