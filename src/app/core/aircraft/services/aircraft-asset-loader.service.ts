import { Injectable, signal } from '@angular/core';

import type { AircraftDefinition } from '../models/aircraft-definition.model';
import type { AircraftSilhouette } from '../models/visual-profile.model';
import {
  createAircraftVisual,
  disposeAircraftVisual,
  type AircraftVisualResult,
} from '../factories/aircraft-visual.factory';

/**
 * Lazy-loads / caches procedural aircraft visuals.
 * No external GLB downloads — project-owned procedural geometry.
 */
@Injectable({ providedIn: 'root' })
export class AircraftAssetLoaderService {
  private readonly cache = new Map<string, AircraftVisualResult>();
  private readonly _loading = signal(false);
  private readonly _lastError = signal<string | null>(null);

  readonly loading = this._loading.asReadonly();
  readonly lastError = this._lastError.asReadonly();

  async load(
    def: AircraftDefinition,
    options: { shadows: boolean; lod?: 'full' | 'chase' | 'fpv'; liveryId?: string },
  ): Promise<AircraftVisualResult> {
    const key = `${def.id}:${options.liveryId ?? def.visualProfile.defaultLiveryId}:${options.lod ?? 'full'}`;
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    this._loading.set(true);
    this._lastError.set(null);
    const t0 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    try {
      // Yield so hangar can show a loading state without blocking the UI thread forever.
      await Promise.resolve();
      const result = createAircraftVisual(def, options);
      this.cache.set(key, result);
      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to build aircraft visual';
      this._lastError.set(message);
      // Procedural fallback — Flux-like freestyle silhouette
      const fallback = createAircraftVisual(def, {
        ...options,
        forceSilhouette: 'freestyle-x' as AircraftSilhouette,
      });
      return fallback;
    } finally {
      this._loading.set(false);
      void t0;
    }
  }

  evict(aircraftId: string): void {
    for (const [key, value] of this.cache) {
      if (key.startsWith(`${aircraftId}:`)) {
        disposeAircraftVisual(value);
        this.cache.delete(key);
      }
    }
  }

  clearAll(): void {
    for (const value of this.cache.values()) {
      disposeAircraftVisual(value);
    }
    this.cache.clear();
  }

  cacheSize(): number {
    return this.cache.size;
  }
}
