import { Injectable, inject } from '@angular/core';
import type { QualityTier } from '@fpv/location-domain';

import type {
  LocationAssetLoadPort,
  LocationLoadFailure,
} from '../ports/location-definition-source.port';
import { CuratedLocationRegistry } from './curated-location-registry';

/**
 * Procedural/bundled asset load port — no network fetch.
 * Validates package presence then returns a handle for runtime install.
 */
@Injectable({ providedIn: 'root' })
export class BundledLocationAssetLoadAdapter implements LocationAssetLoadPort {
  private readonly registry = inject(CuratedLocationRegistry);
  private seq = 0;
  private cancelled = new Set<string>();

  async requestLoad(
    locationId: string,
    options?: { readonly signal?: AbortSignal; readonly qualityTier?: QualityTier },
  ): Promise<
    | { readonly ok: true; readonly handleId: string }
    | { readonly ok: false; readonly failure: LocationLoadFailure }
  > {
    if (options?.signal?.aborted) {
      return {
        ok: false,
        failure: {
          code: 'LOCATION_LOAD_CANCELLED',
          message: 'Location asset load cancelled',
          details: { locationId },
        },
      };
    }

    const record = this.registry.get(locationId);
    if (!record) {
      return {
        ok: false,
        failure: {
          code: 'LOCATION_PACKAGE_NOT_FOUND',
          message: `Location package not found: ${locationId}`,
          details: { locationId },
        },
      };
    }

    this.seq += 1;
    const handleId = `loc-handle-${locationId}-${this.seq}`;
    if (this.cancelled.has(handleId)) {
      return {
        ok: false,
        failure: {
          code: 'LOCATION_LOAD_CANCELLED',
          message: 'Location asset load cancelled',
          details: { locationId, handleId },
        },
      };
    }

    return { ok: true, handleId };
  }

  cancel(handleId: string): void {
    this.cancelled.add(handleId);
  }
}
