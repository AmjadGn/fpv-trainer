import { Injectable, inject } from '@angular/core';

import type { AircraftDefinition } from '../../aircraft/models/aircraft-definition.model';
import { AircraftCatalogService } from '../../aircraft/services/aircraft-catalog.service';
import { SelectedAircraftService } from '../../aircraft/services/selected-aircraft.service';
import { MissionAircraftCapabilitiesAdapter } from '../adapters/mission-aircraft-capabilities.adapter';
import {
  validateMissionFlightLaunchIntent,
  type MissionFlightLaunchIntent,
} from '../models/mission-launch-intent';
import type { MissionRuntimeDiagnostic } from '../models/mission-runtime-diagnostics';
import { LocationLoadCoordinator } from './location-load-coordinator.service';
import { MissionSessionFacade } from './mission-session.facade';
import { FlightSimulationClock } from '../../flight-runtime/services/flight-simulation-clock.service';

export type MissionLaunchPreparationResult =
  | {
      readonly ok: true;
      readonly intent: MissionFlightLaunchIntent;
      readonly sessionGeneration: number;
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly diagnostic: MissionRuntimeDiagnostic;
    };

/**
 * Receives mission launch intent, resolves aircraft via existing selection path,
 * maps capabilities, requests location loading through ports, prepares session state.
 * Does not create factory-only or compiled-only launch paths.
 */
@Injectable({ providedIn: 'root' })
export class MissionLaunchCoordinator {
  private readonly facade = inject(MissionSessionFacade);
  private readonly catalog = inject(AircraftCatalogService);
  private readonly selectedAircraft = inject(SelectedAircraftService);
  private readonly capabilitiesAdapter = inject(MissionAircraftCapabilitiesAdapter);
  private readonly locationLoad = inject(LocationLoadCoordinator);
  private readonly clock = inject(FlightSimulationClock);

  async prepareLaunch(
    rawIntent: unknown,
  ): Promise<MissionLaunchPreparationResult> {
    const validated = validateMissionFlightLaunchIntent(rawIntent);
    if (!validated.ok) {
      const diagnostic: MissionRuntimeDiagnostic = {
        code: validated.code,
        message: validated.reason,
      };
      this.facade.reportFailure(diagnostic);
      return { ok: false, diagnostic };
    }

    const intent = validated.intent;
    this.selectedAircraft.select(intent.aircraftId);

    const definition = this.resolveAircraftDefinition(intent.aircraftId);
    if (!definition) {
      const diagnostic: MissionRuntimeDiagnostic = {
        code: 'AIRCRAFT_INCOMPATIBLE',
        message: `Aircraft "${intent.aircraftId}" is not available in the catalog`,
        details: { aircraftId: intent.aircraftId },
      };
      this.facade.reportFailure(diagnostic);
      return { ok: false, diagnostic };
    }

    const adapted = this.capabilitiesAdapter.adapt(definition);
    if (!adapted.ok) {
      const diagnostic: MissionRuntimeDiagnostic = {
        code: adapted.code,
        message: adapted.reason,
      };
      this.facade.reportFailure(diagnostic);
      return { ok: false, diagnostic };
    }

    if (adapted.capabilities.sourceType !== intent.aircraftSourceType) {
      const diagnostic: MissionRuntimeDiagnostic = {
        code: 'AIRCRAFT_INCOMPATIBLE',
        message: `Aircraft source type mismatch: intent=${intent.aircraftSourceType}, resolved=${adapted.capabilities.sourceType}`,
      };
      this.facade.reportFailure(diagnostic);
      return { ok: false, diagnostic };
    }

    const sessionGeneration = this.clock.beginSession();
    this.facade.beginPreparation(intent, sessionGeneration);
    this.facade.setAircraftCapabilities(adapted.capabilities, adapted.warnings);

    if (intent.developmentFlags?.skipLocationLoad) {
      this.facade.markReady();
      return {
        ok: true,
        intent,
        sessionGeneration,
        warnings: adapted.warnings,
      };
    }

    const loadResult = await this.locationLoad.load(intent.locationId, intent.locationVersion);
    if (!loadResult.ok) {
      this.facade.reportFailure(loadResult.diagnostic);
      return { ok: false, diagnostic: loadResult.diagnostic };
    }

    this.facade.markReady();
    return {
      ok: true,
      intent,
      sessionGeneration,
      warnings: [...adapted.warnings, ...loadResult.warnings],
    };
  }

  private resolveAircraftDefinition(aircraftId: string): AircraftDefinition | null {
    // Shared path: catalog lookup used by Hangar / free flight / builder.
    return this.catalog.getById(aircraftId) ?? null;
  }
}
