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
