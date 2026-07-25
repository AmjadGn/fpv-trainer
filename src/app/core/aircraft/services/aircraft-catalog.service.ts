import { Injectable, computed, signal } from '@angular/core';

import {
  AIRCRAFT_CATALOG,
  AIRCRAFT_CATALOG_VERSION,
} from '../data/aircraft-catalog';
import type { AircraftDefinition } from '../models/aircraft-definition.model';
import type { AircraftCategory } from '../models/aircraft-definition.model';
import type { AircraftId } from '../models/aircraft-ids';
import { DEFAULT_AIRCRAFT_ID } from '../models/aircraft-ids';
import {
  validateAircraftDefinition,
  type ValidationResult,
} from '../validators/aircraft-definition.validator';

export interface AircraftFilter {
  query?: string;
  category?: AircraftCategory | 'all';
  skill?: AircraftDefinition['recommendedSkillLevel'] | 'all';
  favoritesOnly?: boolean;
  favoriteIds?: ReadonlySet<string>;
  /** When true, include user-compiled aircraft tagged `user-build`. */
  includeUserBuilds?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AircraftCatalogService {
  private readonly _catalog = signal<AircraftDefinition[]>([...AIRCRAFT_CATALOG]);

  readonly catalogVersion = AIRCRAFT_CATALOG_VERSION;
  readonly aircraft = this._catalog.asReadonly();
  readonly productionAircraft = computed(() =>
    this._catalog().filter(
      (a) => a.releaseStatus === 'available' && a.unlockPolicy !== 'dev-only',
    ),
  );
  readonly userAircraft = computed(() =>
    this._catalog().filter((a) => a.tags.includes('user-build')),
  );
  readonly factoryAircraft = computed(() =>
    this._catalog().filter((a) => !a.tags.includes('user-build')),
  );

  list(): AircraftDefinition[] {
    return this.productionAircraft();
  }

  getById(id: string | null | undefined): AircraftDefinition | undefined {
    if (!id) {
      return undefined;
    }
    return this._catalog().find((a) => a.id === id || a.slug === id);
  }

  require(id: string | null | undefined): AircraftDefinition {
    const def = this.getById(id) ?? this.getById(DEFAULT_AIRCRAFT_ID);
    if (!def) {
      throw new Error(`Aircraft catalog corrupted — missing ${id ?? 'default'}`);
    }
    return def;
  }

  validateDefinition(def: AircraftDefinition): ValidationResult {
    return validateAircraftDefinition(def);
  }

  validateAll(): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    const ids = new Set<string>();
    const slugs = new Set<string>();
    for (const def of this._catalog()) {
      if (ids.has(def.id)) {
        errors.push(`duplicate id ${def.id}`);
      }
      if (slugs.has(def.slug)) {
        errors.push(`duplicate slug ${def.slug}`);
      }
      ids.add(def.id);
      slugs.add(def.slug);
      const result = validateAircraftDefinition(def);
      if (!result.ok) {
        errors.push(`${def.id}: ${result.errors.join('; ')}`);
      }
    }
    const factoryCount = this._catalog().filter(
      (a) => !a.tags.includes('user-build'),
    ).length;
    if (factoryCount < 6) {
      errors.push('expected at least six commercial aircraft');
    }
    return { ok: errors.length === 0, errors };
  }

  /**
   * Register or replace a user-compiled aircraft definition.
   * Factory definitions are never removed.
   */
  registerCompiledAircraft(def: AircraftDefinition): void {
    const result = validateAircraftDefinition(def);
    if (!result.ok) {
      throw new Error(
        `Cannot register invalid aircraft ${def.id}: ${result.errors.join('; ')}`,
      );
    }
    this._catalog.update((list) => {
      const idx = list.findIndex((a) => a.id === def.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = def;
        return next;
      }
      return [...list, def];
    });
  }

  removeUserAircraft(id: string): void {
    this._catalog.update((list) =>
      list.filter((a) => !(a.id === id && a.tags.includes('user-build'))),
    );
  }

  filter(opts: AircraftFilter): AircraftDefinition[] {
    const q = (opts.query ?? '').trim().toLowerCase();
    const includeUser = opts.includeUserBuilds !== false;
    return this.list().filter((a) => {
      if (!includeUser && a.tags.includes('user-build')) {
        return false;
      }
      if (opts.favoritesOnly && opts.favoriteIds && !opts.favoriteIds.has(a.id)) {
        return false;
      }
      if (opts.category && opts.category !== 'all' && a.category !== opts.category) {
        return false;
      }
      if (opts.skill && opts.skill !== 'all' && a.recommendedSkillLevel !== opts.skill) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        a.displayName.toLowerCase().includes(q) ||
        a.shortDescription.toLowerCase().includes(q) ||
        a.tags.some((t) => t.includes(q)) ||
        a.category.includes(q)
      );
    });
  }

  categories(): AircraftCategory[] {
    return [...new Set(this.list().map((a) => a.category))];
  }

  /** Apply remote overlay availability without replacing physics definitions. */
  applyRemoteAvailability(
    entries: Array<{ aircraftId: AircraftId; availability: string; competitiveAllowed?: boolean }>,
  ): void {
    const map = new Map(entries.map((e) => [e.aircraftId, e]));
    this._catalog.update((list) =>
      list.map((a) => {
        const remote = map.get(a.id);
        if (!remote) {
          return a;
        }
        if (remote.availability === 'disabled' || remote.availability === 'maintenance') {
          return { ...a, releaseStatus: 'maintenance' };
        }
        return a;
      }),
    );
  }
}
