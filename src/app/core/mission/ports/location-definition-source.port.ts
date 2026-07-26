/**
 * Application ports for curated location definition lookup, asset loading,
 * and runtime install. Pure LocationDefinition remains in @fpv/location-domain.
 */

export interface LocationLoadProgress {
  readonly stage:
    | 'idle'
    | 'resolving-definition'
    | 'validating'
    | 'loading-assets'
    | 'installing-runtime'
    | 'ready'
    | 'failed'
    | 'cancelled'
    | 'unloaded';
  readonly fraction: number;
  readonly message?: string;
}

export interface LocationLoadFailure {
  readonly code:
    | 'LOCATION_DEFINITION_UNAVAILABLE'
    | 'LOCATION_VALIDATION_FAILED'
    | 'LOCATION_RUNTIME_LOAD_FAILED';
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface LocationDefinitionSourcePort {
  /**
   * Returns a plain identity/summary record when a definition exists.
   * Does not construct production GLTF/runtime assets.
   */
  lookupDefinition(locationId: string, version?: string): Promise<{
    readonly locationId: string;
    readonly version: string;
    readonly displayName: string;
    readonly available: boolean;
  } | null>;
}

export interface LocationAssetLoadPort {
  /**
   * Requests asset loading for a location. Checkpoint 3: may be a null/test
   * adapter that reports unavailable without claiming success.
   */
  requestLoad(
    locationId: string,
    options?: { readonly signal?: AbortSignal },
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
  install(handleId: string, locationId: string): Promise<
    | { readonly ok: true; readonly handle: LocationRuntimeHandle }
    | { readonly ok: false; readonly failure: LocationLoadFailure }
  >;
  unload(handleId: string): Promise<void>;
  currentGeneration(): number;
}
