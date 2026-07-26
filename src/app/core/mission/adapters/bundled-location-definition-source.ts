import { Injectable, inject } from '@angular/core';
import type { LocationDefinition } from '@fpv/location-domain';
import { checkLocationCompatibility } from '@fpv/location-domain';
import { COORDINATE_SYSTEM_VERSION } from '@fpv/simulation-contracts';

import { LOCATION_CONTENT_RUNTIME_COMPATIBILITY_VERSION } from '../models/location-runtime-compatibility';
import type {
  LocationDefinitionSourcePort,
  LocationDefinitionSummary,
} from '../ports/location-definition-source.port';
import { CuratedLocationRegistry } from './curated-location-registry';

/**
 * Bundled definition source backed by CuratedLocationRegistry.
 * Distinguishes unavailable vs unsupported version.
 */
@Injectable({ providedIn: 'root' })
export class BundledLocationDefinitionSource implements LocationDefinitionSourcePort {
  private readonly registry = inject(CuratedLocationRegistry);

  async listInstalled(): Promise<readonly LocationDefinitionSummary[]> {
    return this.registry.list().map((r) => ({
      locationId: r.locationId,
      version: r.packageVersion,
      displayName: r.displayName,
      available: true,
      primarySubregionId: r.primarySubregionId,
    }));
  }

  async lookupDefinition(
    locationId: string,
    version?: string,
  ): Promise<LocationDefinitionSummary | null> {
    const record = this.registry.get(locationId);
    if (!record) {
      return null;
    }
    if (version && version !== record.packageVersion) {
      return {
        locationId: record.locationId,
        version: record.packageVersion,
        displayName: record.displayName,
        available: false,
        primarySubregionId: record.primarySubregionId,
      };
    }
    const compat = checkLocationCompatibility(record.definition, {
      runtimeCompatibilityVersion: LOCATION_CONTENT_RUNTIME_COMPATIBILITY_VERSION,
      coordinateSystemVersion: COORDINATE_SYSTEM_VERSION,
    });
    return {
      locationId: record.locationId,
      version: record.packageVersion,
      displayName: record.displayName,
      available: compat.status === 'compatible',
      primarySubregionId: record.primarySubregionId,
    };
  }

  async getDefinition(
    locationId: string,
    version?: string,
  ): Promise<LocationDefinition | null> {
    const record = this.registry.get(locationId);
    if (!record) {
      return null;
    }
    if (version && version !== record.packageVersion) {
      return null;
    }
    return record.definition;
  }
}
