import { Injectable, inject } from '@angular/core';

import type { MissionRuntimeDiagnostic } from '../models/mission-runtime-diagnostics';
import type { LocationLoadProgress } from '../ports/location-definition-source.port';
import {
  NullLocationAssetLoadPort,
  NullLocationDefinitionSource,
  NullLocationRuntimeInstallPort,
} from '../adapters/null-location.adapters';
import { MissionSessionFacade } from './mission-session.facade';

export type LocationLoadCoordinatorResult =
  | { readonly ok: true; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly diagnostic: MissionRuntimeDiagnostic };

/**
 * Coordinates definition lookup, validation placeholder, asset load request,
 * progress, cancellation, retry, unload, and failure diagnostics.
 * Does not parse or construct final production assets in Checkpoint 3.
 */
@Injectable({ providedIn: 'root' })
export class LocationLoadCoordinator {
  private readonly facade = inject(MissionSessionFacade);
  private readonly definitions = inject(NullLocationDefinitionSource);
  private readonly assets = inject(NullLocationAssetLoadPort);
  private readonly runtime = inject(NullLocationRuntimeInstallPort);

  private activeHandleId: string | null = null;
  private abort: AbortController | null = null;

  async load(
    locationId: string,
    version?: string,
  ): Promise<LocationLoadCoordinatorResult> {
    await this.unload();

    this.setProgress({ stage: 'resolving-definition', fraction: 0.1 });
    const definition = await this.definitions.lookupDefinition(locationId, version);
    if (!definition || !definition.available) {
      return {
        ok: false,
        diagnostic: {
          code: 'LOCATION_DEFINITION_UNAVAILABLE',
          message: `Location definition unavailable: ${locationId}`,
          details: { locationId, version: version ?? null },
        },
      };
    }

    this.setProgress({ stage: 'validating', fraction: 0.3 });
    // Checkpoint 3: structural presence only; deep validation deferred.
    if (!definition.locationId || !definition.version) {
      return {
        ok: false,
        diagnostic: {
          code: 'LOCATION_VALIDATION_FAILED',
          message: 'Location definition failed structural validation',
          details: { locationId },
        },
      };
    }

    this.abort = new AbortController();
    this.setProgress({ stage: 'loading-assets', fraction: 0.5 });
    const assetResult = await this.assets.requestLoad(locationId, {
      signal: this.abort.signal,
    });
    if (!assetResult.ok) {
      return {
        ok: false,
        diagnostic: {
          code: assetResult.failure.code,
          message: assetResult.failure.message,
          details: assetResult.failure.details,
        },
      };
    }

    this.activeHandleId = assetResult.handleId;
    this.setProgress({ stage: 'installing-runtime', fraction: 0.8 });
    const install = await this.runtime.install(assetResult.handleId, locationId);
    if (!install.ok) {
      return {
        ok: false,
        diagnostic: {
          code: install.failure.code,
          message: install.failure.message,
          details: install.failure.details,
        },
      };
    }

    this.setProgress({ stage: 'ready', fraction: 1 });
    return { ok: true, warnings: [] };
  }

  cancel(): void {
    this.abort?.abort();
    if (this.activeHandleId) {
      this.assets.cancel(this.activeHandleId);
    }
    this.setProgress({ stage: 'cancelled', fraction: 0 });
  }

  async unload(): Promise<void> {
    this.cancel();
    if (this.activeHandleId) {
      await this.runtime.unload(this.activeHandleId);
      this.activeHandleId = null;
    }
    this.setProgress({ stage: 'unloaded', fraction: 0 });
  }

  locationGeneration(): number {
    return this.runtime.currentGeneration();
  }

  private setProgress(progress: LocationLoadProgress): void {
    this.facade.setLocationProgress(progress);
  }
}
