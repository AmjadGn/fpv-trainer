import { Injectable, signal } from '@angular/core';

import {
  findAircraftById,
  resolveAircraftId,
} from '../data/aircraft-catalog';
import { DEFAULT_AIRCRAFT_ID, type AircraftId } from '../models/aircraft-ids';

export const AIRCRAFT_PREFS_STORAGE_KEY = 'fpv-trainer.aircraft-prefs.v1';
export const AIRCRAFT_PREFS_VERSION = 1;

export interface AircraftPreferences {
  version: number;
  selectedAircraftId: AircraftId;
  favoriteAircraftIds: AircraftId[];
  recentlyUsedAircraftIds: AircraftId[];
  preferredLiveryByAircraft: Record<string, string>;
  cameraAngleByAircraft: Record<string, number>;
  rateProfileByAircraft: Record<string, string>;
  hangarAutoRotate: boolean;
  hangarCameraDistance: number;
  quickStartEnabled: boolean;
  lastUsedAircraftId: AircraftId;
}

const DEFAULT_PREFS: AircraftPreferences = {
  version: AIRCRAFT_PREFS_VERSION,
  selectedAircraftId: DEFAULT_AIRCRAFT_ID,
  favoriteAircraftIds: [],
  recentlyUsedAircraftIds: [DEFAULT_AIRCRAFT_ID],
  preferredLiveryByAircraft: {},
  cameraAngleByAircraft: {},
  rateProfileByAircraft: {},
  hangarAutoRotate: true,
  hangarCameraDistance: 1,
  quickStartEnabled: false,
  lastUsedAircraftId: DEFAULT_AIRCRAFT_ID,
};

@Injectable({ providedIn: 'root' })
export class AircraftPersistenceService {
  private readonly _favorites = signal<ReadonlySet<AircraftId>>(new Set());
  private readonly _recent = signal<AircraftId[]>([]);
  private cache: AircraftPreferences = this.read();

  constructor() {
    this._favorites.set(new Set(this.cache.favoriteAircraftIds));
    this._recent.set([...this.cache.recentlyUsedAircraftIds]);
  }

  favorites = this._favorites.asReadonly();
  recent = this._recent.asReadonly();

  load(): AircraftPreferences {
    return this.cache;
  }

  setSelected(id: AircraftId): void {
    this.cache = {
      ...this.cache,
      selectedAircraftId: id,
      lastUsedAircraftId: id,
    };
    this.persist();
  }

  toggleFavorite(id: AircraftId): void {
    const set = new Set(this.cache.favoriteAircraftIds);
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    this.cache = {
      ...this.cache,
      favoriteAircraftIds: [...set],
    };
    this._favorites.set(set);
    this.persist();
  }

  pushRecent(id: AircraftId): void {
    const next = [id, ...this.cache.recentlyUsedAircraftIds.filter((x) => x !== id)].slice(
      0,
      8,
    );
    this.cache = { ...this.cache, recentlyUsedAircraftIds: next };
    this._recent.set(next);
    this.persist();
  }

  setLivery(aircraftId: AircraftId, liveryId: string): void {
    this.cache = {
      ...this.cache,
      preferredLiveryByAircraft: {
        ...this.cache.preferredLiveryByAircraft,
        [aircraftId]: liveryId,
      },
    };
    this.persist();
  }

  setCameraAngle(aircraftId: AircraftId, angleDeg: number): void {
    this.cache = {
      ...this.cache,
      cameraAngleByAircraft: {
        ...this.cache.cameraAngleByAircraft,
        [aircraftId]: angleDeg,
      },
    };
    this.persist();
  }

  setRateProfile(aircraftId: AircraftId, rateProfileId: string): void {
    this.cache = {
      ...this.cache,
      rateProfileByAircraft: {
        ...this.cache.rateProfileByAircraft,
        [aircraftId]: rateProfileId,
      },
    };
    this.persist();
  }

  setHangerPrefs( partial: Partial<Pick<AircraftPreferences, 'hangarAutoRotate' | 'hangarCameraDistance' | 'quickStartEnabled'>>): void {
    this.cache = { ...this.cache, ...partial };
    this.persist();
  }

  /** Cloud sync merge for authenticated users (safe additive). */
  mergeRemote(partial: Partial<AircraftPreferences>): void {
    const selected = resolveAircraftId(
      partial.selectedAircraftId ?? this.cache.selectedAircraftId,
    );
    const favorites = [
      ...new Set([
        ...(partial.favoriteAircraftIds ?? []),
        ...this.cache.favoriteAircraftIds,
      ]),
    ].filter((id) => !!findAircraftById(id)) as AircraftId[];

    this.cache = {
      ...this.cache,
      ...partial,
      version: AIRCRAFT_PREFS_VERSION,
      selectedAircraftId: selected,
      favoriteAircraftIds: favorites,
    };
    this._favorites.set(new Set(this.cache.favoriteAircraftIds));
    this._recent.set([...this.cache.recentlyUsedAircraftIds]);
    this.persist();
  }

  private read(): AircraftPreferences {
    try {
      if (typeof localStorage === 'undefined') {
        return { ...DEFAULT_PREFS };
      }
      const raw = localStorage.getItem(AIRCRAFT_PREFS_STORAGE_KEY);
      if (!raw) {
        return { ...DEFAULT_PREFS };
      }
      const parsed = JSON.parse(raw) as Partial<AircraftPreferences>;
      return this.migrate(parsed);
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  private migrate(parsed: Partial<AircraftPreferences>): AircraftPreferences {
    const selected = resolveAircraftId(parsed.selectedAircraftId);
    const favorites = (parsed.favoriteAircraftIds ?? [])
      .map((id) => resolveAircraftId(id))
      .filter((id, i, arr) => arr.indexOf(id) === i);
    const recent = (parsed.recentlyUsedAircraftIds ?? [selected])
      .map((id) => resolveAircraftId(id))
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .slice(0, 8);

    return {
      ...DEFAULT_PREFS,
      ...parsed,
      version: AIRCRAFT_PREFS_VERSION,
      selectedAircraftId: selected,
      favoriteAircraftIds: favorites,
      recentlyUsedAircraftIds: recent.length ? recent : [selected],
      preferredLiveryByAircraft: parsed.preferredLiveryByAircraft ?? {},
      cameraAngleByAircraft: parsed.cameraAngleByAircraft ?? {},
      rateProfileByAircraft: parsed.rateProfileByAircraft ?? {},
      hangarAutoRotate: parsed.hangarAutoRotate ?? true,
      hangarCameraDistance: parsed.hangarCameraDistance ?? 1,
      quickStartEnabled: parsed.quickStartEnabled ?? false,
      lastUsedAircraftId: resolveAircraftId(
        parsed.lastUsedAircraftId ?? selected,
      ),
    };
  }

  private persist(): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(
        AIRCRAFT_PREFS_STORAGE_KEY,
        JSON.stringify(this.cache),
      );
    } catch {
      // quota / private mode — guest mode continues in memory
    }
  }
}
