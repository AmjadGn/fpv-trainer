import type { ComponentType } from '@fpv/component-catalog';

/**
 * Presentation-only media metadata for Builder UI.
 * Must never feed engineering calculations, validation, fingerprints,
 * assembly topology, or compilation artifacts.
 */
export interface ComponentPresentationMedia {
  readonly componentRevisionId: string;
  readonly thumbnailAssetPath: string;
  readonly imageAssetPath: string;
  readonly altText: string;
  readonly sourceLabel?: string;
  readonly licenseLabel?: string;
  /**
   * True when the asset is the generic category illustration rather than a
   * dedicated component illustration.
   */
  readonly usesCategoryFallback: boolean;
  /**
   * Optional visual validation metadata — presentation-only.
   * Never included in engineering fingerprints.
   */
  readonly visual?: ComponentVisualMetadata;
}

/** Presentation-only visual metadata used for asset validation tests. */
export interface ComponentVisualMetadata {
  readonly category: ComponentType;
  /** Motor stator class e.g. "1103", "2306"; null when N/A. */
  readonly motorStatorClass?: string | null;
  /** Propeller blade count depicted in the asset. */
  readonly propellerBladeCount?: number | null;
  /** Propeller diameter class in inches or mm label, e.g. "5in", "65mm". */
  readonly propellerDiameterClass?: string | null;
  /** Intentional shared fallback marker — only for category silhouettes. */
  readonly intentionalSharedFallback?: boolean;
}

/** UI-resolved media result for templates. */
export interface ResolvedComponentMedia {
  readonly thumbnailUrl: string;
  readonly imageUrl: string;
  readonly altText: string;
  readonly isFallback: boolean;
  readonly sourceLabel: string | null;
  readonly licenseLabel: string | null;
  readonly category: ComponentType | 'unknown';
}
