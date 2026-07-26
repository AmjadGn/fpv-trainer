import { Injectable, signal } from '@angular/core';
import type { QualityTier } from '@fpv/location-domain';

export interface LocationRuntimeDiagnostics {
  readonly visualObjectCount: number;
  readonly geometryCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly colliderCount: number;
  readonly spatialQueryReady: boolean;
  readonly locationGeneration: number;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly qualityTier: QualityTier;
}

/**
 * Development diagnostics for curated location runtime.
 * Not gameplay authority.
 */
@Injectable({ providedIn: 'root' })
export class LocationRuntimeDiagnosticsService {
  private readonly _snapshot = signal<LocationRuntimeDiagnostics | null>(null);
  readonly snapshot = this._snapshot.asReadonly();

  set(diagnostics: LocationRuntimeDiagnostics): void {
    this._snapshot.set(diagnostics);
  }

  clear(): void {
    this._snapshot.set(null);
  }
}
