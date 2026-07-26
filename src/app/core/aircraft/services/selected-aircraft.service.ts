import { Injectable, computed, inject, signal } from '@angular/core';

import { DEFAULT_AIRCRAFT_ID, type AircraftId } from '../models/aircraft-ids';
import { AircraftCatalogService } from './aircraft-catalog.service';
import { AircraftPersistenceService } from './aircraft-persistence.service';

@Injectable({ providedIn: 'root' })
export class SelectedAircraftService {
  private readonly catalog = inject(AircraftCatalogService);
  private readonly persistence = inject(AircraftPersistenceService);

  private readonly _selectedId = signal<AircraftId>(
    this.persistence.load().selectedAircraftId,
  );

  readonly selectedAircraftId = this._selectedId.asReadonly();
  readonly favoriteIds = computed(() => this.persistence.favorites());
  readonly recentlyUsedIds = computed(() => this.persistence.recent());
  readonly selectedDefinition = computed(() =>
    this.catalog.require(this._selectedId()),
  );
  readonly preferredLiveryId = computed(() => {
    const prefs = this.persistence.load();
    return (
      prefs.preferredLiveryByAircraft[this._selectedId()] ??
      this.selectedDefinition().visualProfile.defaultLiveryId
    );
  });
  readonly quickStartEnabled = computed(
    () => this.persistence.load().quickStartEnabled,
  );

  select(id: string): AircraftId {
    const def = this.catalog.getById(id);
    const resolved = (def?.id ?? DEFAULT_AIRCRAFT_ID) as AircraftId;
    this._selectedId.set(resolved);
    this.persistence.setSelected(resolved);
    this.persistence.pushRecent(resolved);
    return resolved;
  }

  /**
   * Select an exact aircraft id with no DEFAULT_AIRCRAFT_ID fallback.
   * Used by Hangar "Fly" actions on compiled builds — flying the wrong
   * (fallback) aircraft would be worse than refusing to launch. Returns
   * null when the id is not currently registered in the catalog.
   */
  trySelectExact(id: string): AircraftId | null {
    const def = this.catalog.getById(id);
    if (!def || def.id !== id) {
      return null;
    }
    const resolved = def.id;
    this._selectedId.set(resolved);
    this.persistence.setSelected(resolved);
    this.persistence.pushRecent(resolved);
    return resolved;
  }

  toggleFavorite(id: AircraftId): void {
    this.persistence.toggleFavorite(id);
  }

  isFavorite(id: AircraftId): boolean {
    return this.persistence.favorites().has(id);
  }

  setLivery(aircraftId: AircraftId, liveryId: string): void {
    this.persistence.setLivery(aircraftId, liveryId);
  }

  setCameraAngle(aircraftId: AircraftId, angleDeg: number): void {
    this.persistence.setCameraAngle(aircraftId, angleDeg);
  }

  getCameraAngle(aircraftId: AircraftId): number | undefined {
    return this.persistence.load().cameraAngleByAircraft[aircraftId];
  }

  setRateProfile(aircraftId: AircraftId, rateProfileId: string): void {
    this.persistence.setRateProfile(aircraftId, rateProfileId);
  }

  getRateProfile(aircraftId: AircraftId): string | undefined {
    return this.persistence.load().rateProfileByAircraft[aircraftId];
  }

  setQuickStart(enabled: boolean): void {
    this.persistence.setHangerPrefs({ quickStartEnabled: enabled });
  }
}
