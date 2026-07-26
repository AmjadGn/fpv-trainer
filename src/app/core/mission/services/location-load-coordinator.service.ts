import { Injectable, inject } from '@angular/core';
import { validateLocationDefinition } from '@fpv/location-validation';
import { checkLocationCompatibility } from '@fpv/location-domain';
import { COORDINATE_SYSTEM_VERSION } from '@fpv/simulation-contracts';

import type { MissionRuntimeDiagnostic } from '../models/mission-runtime-diagnostics';
import { LOCATION_CONTENT_RUNTIME_COMPATIBILITY_VERSION } from '../models/location-runtime-compatibility';
import {
  LOCATION_ASSET_LOAD,
  LOCATION_DEFINITION_SOURCE,
  LOCATION_RUNTIME_INSTALL,
  type LocationLoadProgress,
} from '../ports/location-definition-source.port';
import { MissionSessionFacade } from './mission-session.facade';
import {
  MEDITERRANEAN_PROVENANCE_RECORDS,
} from '../../../content/locations/mediterranean-expedition-region';

export type LocationLoadCoordinatorResult =
  | { readonly ok: true; readonly warnings: readonly string[]; readonly locationGeneration: number }
  | { readonly ok: false; readonly diagnostic: MissionRuntimeDiagnostic };

/**
 * Coordinates definition lookup → validation → visual/collision/query install
 * with cancellation, retry, unload, and atomic failure cleanup.
 */
@Injectable({ providedIn: 'root' })
export class LocationLoadCoordinator {
  private readonly facade = inject(MissionSessionFacade);
  private readonly definitions = inject(LOCATION_DEFINITION_SOURCE);
  private readonly assets = inject(LOCATION_ASSET_LOAD);
  private readonly runtime = inject(LOCATION_RUNTIME_INSTALL);

  private activeHandleId: string | null = null;
  private abort: AbortController | null = null;
  private loadGeneration = 0;

  async load(
    locationId: string,
    version?: string,
  ): Promise<LocationLoadCoordinatorResult> {
    await this.unload();
    const myGeneration = ++this.loadGeneration;
    this.abort = new AbortController();
    const signal = this.abort.signal;

    this.setProgress({
      stage: 'resolving',
      fraction: 0.05,
      message: 'Resolving location definition',
    });

    const summary = await this.definitions.lookupDefinition(locationId, version);
    if (!summary) {
      return this.fail('LOCATION_PACKAGE_NOT_FOUND', `Location package not found: ${locationId}`, {
        locationId,
        version: version ?? null,
      });
    }
    if (!summary.available) {
      return this.fail(
        'LOCATION_PACKAGE_VERSION_UNSUPPORTED',
        `Location package version unsupported or incompatible: ${locationId}`,
        { locationId, version: summary.version },
      );
    }

    this.setProgress({ stage: 'resolving-definition', fraction: 0.12 });
    const definition = this.definitions.getDefinition
      ? await this.definitions.getDefinition(locationId, version)
      : null;
    if (!definition) {
      return this.fail(
        'LOCATION_DEFINITION_UNAVAILABLE',
        `Location definition unavailable: ${locationId}`,
        { locationId },
      );
    }

    if (this.isStale(myGeneration, signal)) {
      return this.fail('LOCATION_LOAD_CANCELLED', 'Location load cancelled', { locationId });
    }

    this.setProgress({ stage: 'validating', fraction: 0.25, message: 'Validating content' });
    const report = validateLocationDefinition(definition, {
      provenanceRecords: [...MEDITERRANEAN_PROVENANCE_RECORDS],
      knownLandmarkIds: definition.photographySubjects
        .map((s) => s.landmarkId)
        .filter((id): id is NonNullable<typeof id> => id !== undefined)
        .map((id) => String(id)),
    });
    if (!report.ok) {
      return this.fail(
        'LOCATION_CONTENT_INVALID',
        'Location content failed domain validation',
        {
          locationId,
          codes: report.issues.map((i) => i.code),
        },
      );
    }

    const compat = checkLocationCompatibility(definition, {
      runtimeCompatibilityVersion: LOCATION_CONTENT_RUNTIME_COMPATIBILITY_VERSION,
      coordinateSystemVersion: COORDINATE_SYSTEM_VERSION,
    });
    if (compat.status === 'incompatible') {
      return this.fail(
        'LOCATION_PACKAGE_VERSION_UNSUPPORTED',
        'Location runtime compatibility check failed',
        {
          locationId,
          issues: compat.issues.map((i) => i.code),
        },
      );
    }

    if (this.isStale(myGeneration, signal)) {
      return this.fail('LOCATION_LOAD_CANCELLED', 'Location load cancelled', { locationId });
    }

    this.setProgress({ stage: 'loading-assets', fraction: 0.4 });
    this.setProgress({
      stage: 'loadingVisuals',
      fraction: 0.45,
      message: 'Preparing visuals',
    });
    const assetResult = await this.assets.requestLoad(locationId, { signal });
    if (!assetResult.ok) {
      return this.fail(
        assetResult.failure.code,
        assetResult.failure.message,
        assetResult.failure.details,
      );
    }

    if (this.isStale(myGeneration, signal)) {
      this.assets.cancel(assetResult.handleId);
      return this.fail('LOCATION_LOAD_CANCELLED', 'Location load cancelled', { locationId });
    }

    this.activeHandleId = assetResult.handleId;
    this.setProgress({
      stage: 'loadingCollisions',
      fraction: 0.65,
      message: 'Preparing collisions',
    });
    this.setProgress({
      stage: 'installingQueries',
      fraction: 0.8,
      message: 'Installing spatial queries',
    });
    this.setProgress({ stage: 'installing-runtime', fraction: 0.85 });

    const install = await this.runtime.install(assetResult.handleId, locationId, { signal });
    if (!install.ok) {
      this.activeHandleId = null;
      return this.fail(install.failure.code, install.failure.message, install.failure.details);
    }

    if (this.isStale(myGeneration, signal)) {
      await this.runtime.unload(assetResult.handleId);
      this.activeHandleId = null;
      return this.fail(
        'STALE_LOCATION_GENERATION',
        'Stale location load completion rejected',
        { locationId, generation: myGeneration },
      );
    }

    this.setProgress({ stage: 'finalizing', fraction: 0.95 });
    this.setProgress({ stage: 'ready', fraction: 1, message: 'Location ready' });
    return {
      ok: true,
      warnings: [],
      locationGeneration: install.handle.locationGeneration,
    };
  }

  cancel(): void {
    this.abort?.abort();
    if (this.activeHandleId) {
      this.assets.cancel(this.activeHandleId);
    }
    this.loadGeneration += 1;
    this.setProgress({ stage: 'cancelled', fraction: 0 });
  }

  async unload(): Promise<void> {
    this.cancel();
    this.setProgress({ stage: 'unloading', fraction: 0 });
    if (this.activeHandleId) {
      try {
        await this.runtime.unload(this.activeHandleId);
      } catch (err) {
        this.facade.reportFailure({
          code: 'LOCATION_UNLOAD_FAILED',
          message: err instanceof Error ? err.message : 'Location unload failed',
        });
      }
      this.activeHandleId = null;
    }
    this.setProgress({ stage: 'unloaded', fraction: 0 });
  }

  locationGeneration(): number {
    return this.runtime.currentGeneration();
  }

  private isStale(myGeneration: number, signal: AbortSignal): boolean {
    return signal.aborted || myGeneration !== this.loadGeneration;
  }

  private fail(
    code: MissionRuntimeDiagnostic['code'],
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ): LocationLoadCoordinatorResult {
    this.setProgress({ stage: 'failed', fraction: 0, message });
    return {
      ok: false,
      diagnostic: { code, message, details },
    };
  }

  private setProgress(progress: LocationLoadProgress): void {
    this.facade.setLocationProgress(progress);
  }
}
