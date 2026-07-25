import { Injectable, inject, signal } from '@angular/core';

import {
  flightProfileToAppliedConfig,
  type AppliedFlightConfig,
} from '../adapters/flight-profile.adapter';
import type { AircraftDefinition } from '../models/aircraft-definition.model';
import type { AircraftRuntime, AircraftTelemetrySnapshot } from '../models/aircraft-runtime.model';
import type { AircraftId } from '../models/aircraft-ids';
import { DEFAULT_AIRCRAFT_ID } from '../models/aircraft-ids';
import { validateAircraftDefinition } from '../validators/aircraft-definition.validator';
import { AircraftCatalogService } from './aircraft-catalog.service';
import { AircraftStatsService } from './aircraft-stats.service';
import { SelectedAircraftService } from './selected-aircraft.service';

/**
 * Loads and validates the active aircraft into the single simulator runtime.
 * Does not own physics world, renderer, or RAF loop.
 */
@Injectable({ providedIn: 'root' })
export class AircraftRuntimeService {
  private readonly catalog = inject(AircraftCatalogService);
  private readonly selected = inject(SelectedAircraftService);
  private readonly stats = inject(AircraftStatsService);

  private readonly _runtime = signal<AircraftRuntime | null>(null);
  private readonly _telemetry = signal<AircraftTelemetrySnapshot>({
    loadedAircraftAssets: 0,
    totalGeometryCount: 0,
    textureMemoryEstimateBytes: 0,
    activeAudioNodes: 0,
    lastAircraftSwitchMs: 0,
    lastModelLoadMs: 0,
    lastColliderRebuildMs: 0,
  });
  private readonly _warnings = signal<string[]>([]);

  readonly runtime = this._runtime.asReadonly();
  readonly telemetry = this._telemetry.asReadonly();
  readonly warnings = this._warnings.asReadonly();

  /** Prepare aircraft for flight start. Returns applied flight config. */
  prepareForFlight(aircraftId?: string, liveryId?: string): {
    definition: AircraftDefinition;
    applied: AppliedFlightConfig;
    warnings: string[];
  } {
    const t0 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const id = (aircraftId
      ? this.selected.select(aircraftId)
      : this.selected.selectedAircraftId()) as AircraftId;

    let definition = this.catalog.require(id);
    const validation = validateAircraftDefinition(definition);
    const warnings = [...validation.warnings];

    if (!validation.ok) {
      warnings.push(
        `Invalid profile for ${id}; falling back to ${DEFAULT_AIRCRAFT_ID}.`,
      );
      warnings.push(...validation.errors);
      definition = this.catalog.require(DEFAULT_AIRCRAFT_ID);
    }

    const livery =
      liveryId ??
      this.selected.preferredLiveryId() ??
      definition.visualProfile.defaultLiveryId;

    const applied = flightProfileToAppliedConfig(definition);
    const stats = this.stats.derive(definition);

    this._runtime.set({
      aircraftId: definition.id,
      definition,
      liveryId: livery,
      loadedAt: Date.now(),
      stats,
      warnings,
    });
    this._warnings.set(warnings);

    const elapsed =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    this._telemetry.update((t) => ({
      ...t,
      lastAircraftSwitchMs: elapsed,
      loadedAircraftAssets: 1,
    }));

    return { definition, applied, warnings };
  }

  recordModelLoad(ms: number, geometryCount: number): void {
    this._telemetry.update((t) => ({
      ...t,
      lastModelLoadMs: ms,
      totalGeometryCount: geometryCount,
      loadedAircraftAssets: Math.max(1, t.loadedAircraftAssets),
    }));
  }

  recordColliderRebuild(ms: number): void {
    this._telemetry.update((t) => ({
      ...t,
      lastColliderRebuildMs: ms,
    }));
  }

  recordAudioNodes(count: number): void {
    this._telemetry.update((t) => ({
      ...t,
      activeAudioNodes: count,
    }));
  }

  clear(): void {
    this._runtime.set(null);
  }
}
