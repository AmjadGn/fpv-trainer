import { Injectable } from '@angular/core';
import type { ComponentType } from '@fpv/component-catalog';

import {
  CATEGORY_FALLBACK_ASSET_PATHS,
  COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID,
} from '../models/component-presentation-media.registry';
import type {
  ComponentPresentationMedia,
  ResolvedComponentMedia,
} from '../models/component-presentation-media.models';
import { stockedCategoryLabel } from '../models/build-intent.profiles';

/**
 * Resolves presentation media for Builder UI.
 * Templates must use this service — never build asset paths from raw IDs.
 */
@Injectable({ providedIn: 'root' })
export class ComponentPresentationMediaService {
  resolve(
    componentRevisionId: string | null | undefined,
    category: ComponentType | 'unknown' = 'unknown',
    displayName?: string | null,
  ): ResolvedComponentMedia {
    const entry = this.lookup(componentRevisionId);
    if (entry) {
      return this.toResolved(entry, category);
    }
    return this.categoryFallback(category, displayName);
  }

  resolveForCategory(
    category: ComponentType,
    displayName?: string | null,
  ): ResolvedComponentMedia {
    return this.categoryFallback(category, displayName);
  }

  lookup(
    componentRevisionId: string | null | undefined,
  ): ComponentPresentationMedia | null {
    if (!componentRevisionId) return null;
    return (
      COMPONENT_PRESENTATION_MEDIA_BY_REVISION_ID[componentRevisionId] ?? null
    );
  }

  onImageError(
    event: Event,
    category: ComponentType | 'unknown' = 'unknown',
  ): void {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const fallback = CATEGORY_FALLBACK_ASSET_PATHS[category] ?? CATEGORY_FALLBACK_ASSET_PATHS.unknown;
    if (img.src.endsWith(fallback) || img.getAttribute('data-fallback') === '1') {
      img.removeAttribute('src');
      img.alt = img.alt || 'Component illustration unavailable';
      img.style.visibility = 'hidden';
      return;
    }
    img.setAttribute('data-fallback', '1');
    img.src = fallback;
  }

  private toResolved(
    entry: ComponentPresentationMedia,
    category: ComponentType | 'unknown',
  ): ResolvedComponentMedia {
    return {
      thumbnailUrl: entry.thumbnailAssetPath,
      imageUrl: entry.imageAssetPath,
      altText: entry.altText,
      isFallback: entry.usesCategoryFallback,
      sourceLabel: entry.sourceLabel ?? null,
      licenseLabel: entry.licenseLabel ?? null,
      category,
    };
  }

  private categoryFallback(
    category: ComponentType | 'unknown',
    displayName?: string | null,
  ): ResolvedComponentMedia {
    const path =
      CATEGORY_FALLBACK_ASSET_PATHS[category] ??
      CATEGORY_FALLBACK_ASSET_PATHS.unknown;
    const label =
      category === 'unknown'
        ? 'component'
        : stockedCategoryLabel(category).toLowerCase();
    const name = displayName?.trim() || `Generic ${label}`;
    return {
      thumbnailUrl: path,
      imageUrl: path,
      altText: `${name} — generic ${label} illustration`,
      isFallback: true,
      sourceLabel: 'FPV Trainer project-owned silhouette',
      licenseLabel: 'Project asset · not commercial product photography',
      category,
    };
  }
}
