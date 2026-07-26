import type { ComponentType } from '@fpv/component-catalog';
import type { ValidationSeverity } from '@fpv/compatibility-engine';

import type { ResolvedComponentMedia } from './component-presentation-media.models';

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

/** Stocked official-catalog categories for the playable Simple Builder. */
export const SIMPLE_STOCKED_CATEGORIES: readonly ComponentType[] = [
  'frame',
  'motor',
  'propeller',
  'esc',
  'battery',
  'flight-controller',
  'camera',
  'video-transmitter',
  'receiver',
] as const;

export type CategoryCompletionStatus =
  | 'selected'
  | 'missing'
  | 'needs-attention'
  | 'recommended';

export type BuildReadinessState =
  | 'incomplete'
  | 'has-blocking-issues'
  | 'ready-to-compile'
  | 'compiled';

/** Explicit save lifecycle — avoid contradictory booleans. */
export type BuilderSaveState =
  | 'unsaved'
  | 'saving'
  | 'saved'
  | 'save-failed'
  | 'storage-unavailable';
export type CompatibilitySummaryLevel =
  | 'cannot-compile'
  | 'needs-attention'
  | 'recommendation'
  | 'all-compatible';

/** Product guidance only — never bypasses validation or engineering. */
export interface BuildIntentProfile {
  readonly id: BuildIntentId;
  readonly title: string;
  readonly shortDescription: string;
  readonly plainLanguageGoal: string;
  readonly expectedFeel: string;
  readonly mainTradeOff: string;
  readonly factoryRecommendationLabel: string;
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
  readonly affectedPartLabel: string;
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

export type EngineeringStatConfidenceLabel =
  | 'high'
  | 'medium'
  | 'low'
  | 'unavailable';

export interface BuilderEngineeringStatView {
  readonly id: string;
  readonly label: string;
  readonly simpleLabel: string;
  readonly value: number | string | null;
  readonly displayValue: string;
  readonly interpretation: string;
  readonly unit: string;
  readonly confidence: EngineeringStatConfidenceLabel;
  readonly source: EngineeringStatSourceLabel;
  readonly sourceBrief: string;
  readonly limitations: string;
  readonly available: boolean;
  /** Advanced mode only. */
  readonly advancedOnly: boolean;
}

export interface BuilderComponentOptionView {
  readonly revisionId: string;
  readonly name: string;
  readonly category: ComponentType;
  readonly categoryLabel: string;
  readonly mainSpec: string;
  /** Short distinguishing labels shown on cards (stator, KV, blades, etc.). */
  readonly distinguishingLabels: readonly string[];
  readonly recommendedUse: string;
  readonly compatibilityStatus:
    | 'compatible'
    | 'warning'
    | 'incompatible'
    | 'unknown';
  readonly simplePerformanceEffect: string;
  readonly massKg: number | null;
  readonly massLabel: string;
  readonly isRecommended: boolean;
  readonly selected: boolean;
  /** Presentation-only; never used for engineering or fingerprints. */
  readonly media: ResolvedComponentMedia;
}

export interface BuilderCategoryProgressView {
  readonly category: ComponentType;
  readonly label: string;
  readonly status: CategoryCompletionStatus;
  readonly selectedName: string | null;
  readonly selectedRevisionId: string | null;
  readonly media: ResolvedComponentMedia | null;
  readonly active: boolean;
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
  readonly sourceBuildRevisionId: string | null;
  readonly catalogReleaseId: string | null;
  readonly validationCanCompile: boolean | null;
  readonly confidenceSummary: string | null;
  readonly failedStage: string | null;
  readonly developmentDiagnosticCode: string | null;
}

export interface BuilderSpecFieldView {
  readonly label: string;
  readonly value: string;
  readonly available: boolean;
}

export interface BuilderAdvancedComponentDetailView {
  readonly option: BuilderComponentOptionView;
  readonly revisionDisplay: string;
  readonly manufacturerLabel: string;
  readonly tags: readonly string[];
  readonly physicalSpecs: readonly BuilderSpecFieldView[];
  readonly electricalSpecs: readonly BuilderSpecFieldView[];
  readonly dataAvailability: string;
}

export interface BuilderTuningInfoView {
  readonly editable: boolean;
  readonly summary: string;
  readonly fields: readonly BuilderSpecFieldView[];
}

export interface BuilderProvenanceInfoView {
  readonly label: EngineeringStatSourceLabel;
  readonly description: string;
  readonly confidence: EngineeringStatConfidenceLabel;
  readonly datasetHint: string | null;
  readonly limitations: string;
}

export interface BuilderSessionSnapshot {
  readonly phase: BuilderPhase;
  readonly mode: BuilderMode;
  readonly intentId: BuildIntentId | null;
  readonly buildId: string | null;
  readonly buildName: string;
  readonly nameManuallySet: boolean;
  readonly dirty: boolean;
  readonly saveState: BuilderSaveState;
  readonly lastSavedAtIso: string | null;
  readonly persistenceBackend: 'indexeddb' | 'memory-fallback' | 'unknown';
  readonly activeCategory: ComponentType;
  readonly selectedRevisionIdsBySlot: Readonly<Record<string, string>>;
  readonly canCompile: boolean;
  readonly compileBlockedReason: string | null;
  readonly compileStale: boolean;
  readonly lastCompile: BuilderCompileResultView | null;
  readonly launchAircraftName: string | null;
  readonly readiness: BuildReadinessState;
  readonly compatibilityLevel: CompatibilitySummaryLevel;
  readonly hasMissingComponents: boolean;
}
