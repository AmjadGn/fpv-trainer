import { Injectable } from '@angular/core';

import type {
  LocationAssetLoadPort,
  LocationDefinitionSourcePort,
  LocationLoadFailure,
  LocationRuntimeHandle,
  LocationRuntimeInstallPort,
} from '../ports/location-definition-source.port';

/**
 * Null definition source — no curated location packages are installed yet.
 * Must not claim a legacy trainer environment is the mission location.
 */
@Injectable({ providedIn: 'root' })
export class NullLocationDefinitionSource implements LocationDefinitionSourcePort {
  async lookupDefinition(
    _locationId: string,
    _version?: string,
  ): Promise<{
    readonly locationId: string;
    readonly version: string;
    readonly displayName: string;
    readonly available: boolean;
  } | null> {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class NullLocationAssetLoadPort implements LocationAssetLoadPort {
  async requestLoad(
    locationId: string,
    _options?: { readonly signal?: AbortSignal },
  ): Promise<
    | { readonly ok: true; readonly handleId: string }
    | { readonly ok: false; readonly failure: LocationLoadFailure }
  > {
    return {
      ok: false,
      failure: {
        code: 'LOCATION_RUNTIME_LOAD_FAILED',
        message: `Location assets are not installed for "${locationId}" in this build`,
        details: { locationId },
      },
    };
  }

  cancel(_handleId: string): void {
    // no-op
  }
}

@Injectable({ providedIn: 'root' })
export class NullLocationRuntimeInstallPort implements LocationRuntimeInstallPort {
  private generation = 0;

  async install(
    handleId: string,
    locationId: string,
  ): Promise<
    | { readonly ok: true; readonly handle: LocationRuntimeHandle }
    | { readonly ok: false; readonly failure: LocationLoadFailure }
  > {
    return {
      ok: false,
      failure: {
        code: 'LOCATION_RUNTIME_LOAD_FAILED',
        message: `Location runtime install unavailable for "${locationId}" (handle ${handleId})`,
      },
    };
  }

  async unload(_handleId: string): Promise<void> {
    this.generation += 1;
  }

  currentGeneration(): number {
    return this.generation;
  }
}
