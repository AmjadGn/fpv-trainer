/**
 * Application ports for curated location definition lookup, asset loading,
 * and runtime install. Pure LocationDefinition remains in @fpv/location-domain.
 */

import { InjectionToken } from '@angular/core';
import type { LocationDefinition } from '@fpv/location-domain';
import type { QualityTier } from '@fpv/location-domain';

export interface LocationLoadProgress {
  readonly stage:
    | 'idle'
    | 'unloaded'
    | 'resolving'
    | 'resolving-definition'
    | 'validating'
    | 'loadingVisuals'
    | 'loadingCollisions'
    | 'installingQueries'
    | 'finalizing'
    | 'loading-assets'
    | 'installing-runtime'
    | 'ready'
    | 'failed'
    | 'cancelled'
    | 'unloading';
  readonly fraction: number;
  readonly message?: string;
}

export type LocationLoadFailureCode =
  | 'LOCATION_PACKAGE_NOT_FOUND'
  | 'LOCATION_DEFINITION_UNAVAILABLE'
  | 'LOCATION_PACKAGE_VERSION_UNSUPPORTED'
  | 'LOCATION_CONTENT_INVALID'
  | 'LOCATION_VALIDATION_FAILED'
  | 'LOCATION_VISUAL_BUILD_FAILED'
  | 'LOCATION_COLLISION_BUILD_FAILED'
  | 'LOCATION_QUERY_INSTALL_FAILED'
  | 'LOCATION_PREVIOUS_COLLISION_RESTORE_FAILED'
  | 'LOCATION_LOAD_CANCELLED'
  | 'STALE_LOCATION_GENERATION'
  | 'LOCATION_UNLOAD_FAILED'
  | 'LOCATION_RUNTIME_LOAD_FAILED';

export interface LocationLoadFailure {
  readonly code: LocationLoadFailureCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface LocationDefinitionSummary {
  readonly locationId: string;
  readonly version: string;
  readonly displayName: string;
  readonly available: boolean;
  readonly primarySubregionId?: string;
}

export interface LocationDefinitionSourcePort {
  /**
   * Returns a plain identity/summary record when a definition exists.
   * Does not construct production GLTF/runtime assets.
   */
  lookupDefinition(
    locationId: string,
    version?: string,
  ): Promise<LocationDefinitionSummary | null>;

  /** Full immutable definition when available. */
  getDefinition?(
    locationId: string,
    version?: string,
  ): Promise<LocationDefinition | null>;

  listInstalled?(): Promise<readonly LocationDefinitionSummary[]>;
}

export interface LocationAssetLoadPort {
  requestLoad(
    locationId: string,
    options?: { readonly signal?: AbortSignal; readonly qualityTier?: QualityTier },
  ): Promise<
    | { readonly ok: true; readonly handleId: string }
    | { readonly ok: false; readonly failure: LocationLoadFailure }
  >;
  cancel(handleId: string): void;
}

export interface LocationRuntimeHandle {
  readonly handleId: string;
  readonly locationId: string;
  readonly locationGeneration: number;
  readonly installed: boolean;
}

export interface LocationRuntimeInstallPort {
  install(
    handleId: string,
    locationId: string,
    options?: { readonly signal?: AbortSignal; readonly qualityTier?: QualityTier },
  ): Promise<
    | { readonly ok: true; readonly handle: LocationRuntimeHandle }
    | { readonly ok: false; readonly failure: LocationLoadFailure }
  >;
  unload(handleId: string): Promise<void>;
  currentGeneration(): number;
}

export const LOCATION_DEFINITION_SOURCE = new InjectionToken<LocationDefinitionSourcePort>(
  'LOCATION_DEFINITION_SOURCE',
);

export const LOCATION_ASSET_LOAD = new InjectionToken<LocationAssetLoadPort>(
  'LOCATION_ASSET_LOAD',
);

export const LOCATION_RUNTIME_INSTALL = new InjectionToken<LocationRuntimeInstallPort>(
  'LOCATION_RUNTIME_INSTALL',
);
