import { Injectable } from '@angular/core';
import type { LocationDefinition } from '@fpv/location-domain';
import { validateLocationDefinition } from '@fpv/location-validation';

import {
  COASTAL_RUINS_SUBREGION_ID,
  getMediterraneanExpeditionRegionLocation,
  LOCATION_DISPLAY_NAME,
  MEDITERRANEAN_LOCATION_ID,
  MEDITERRANEAN_PACKAGE_VERSION,
  MEDITERRANEAN_PROVENANCE_RECORDS,
} from '../../../content/locations/mediterranean-expedition-region';

export interface CuratedLocationPackageRecord {
  readonly locationId: string;
  readonly packageVersion: string;
  readonly displayName: string;
  readonly primarySubregionId: string;
  readonly definition: LocationDefinition;
  readonly provenanceRecordIds: readonly string[];
}

/**
 * In-memory registry of installed curated location packages.
 * Does not register legacy trainer environments (e.g. fallback-flat).
 */
@Injectable({ providedIn: 'root' })
export class CuratedLocationRegistry {
  private readonly byId = new Map<string, CuratedLocationPackageRecord>();

  constructor() {
    this.registerMediterranean();
  }

  private registerMediterranean(): void {
    const definition = getMediterraneanExpeditionRegionLocation();
    const report = validateLocationDefinition(definition, {
      provenanceRecords: [...MEDITERRANEAN_PROVENANCE_RECORDS],
      knownLandmarkIds: definition.photographySubjects
        .map((s) => s.landmarkId)
        .filter((id): id is NonNullable<typeof id> => id !== undefined)
        .map((id) => String(id)),
    });
    if (!report.ok) {
      throw new Error(
        `Mediterranean location package failed domain validation: ${report.issues
          .map((i) => i.code)
          .join(', ')}`,
      );
    }
    this.register({
      locationId: MEDITERRANEAN_LOCATION_ID,
      packageVersion: MEDITERRANEAN_PACKAGE_VERSION,
      displayName: LOCATION_DISPLAY_NAME,
      primarySubregionId: COASTAL_RUINS_SUBREGION_ID,
      definition,
      provenanceRecordIds: MEDITERRANEAN_PROVENANCE_RECORDS.map((r) => String(r.id)),
    });
  }

  register(record: CuratedLocationPackageRecord): void {
    if (record.locationId === 'fallback-flat') {
      throw new Error('fallback-flat must not be registered as curated content');
    }
    if (this.byId.has(record.locationId)) {
      throw new Error(`Duplicate curated location id: ${record.locationId}`);
    }
    this.byId.set(record.locationId, Object.freeze({ ...record }));
  }

  list(): readonly CuratedLocationPackageRecord[] {
    return [...this.byId.values()];
  }

  get(locationId: string): CuratedLocationPackageRecord | null {
    return this.byId.get(locationId) ?? null;
  }

  has(locationId: string): boolean {
    return this.byId.has(locationId);
  }
}
