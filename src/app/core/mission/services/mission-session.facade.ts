import { Injectable, signal } from '@angular/core';

import type { MissionAircraftCapabilities } from '@fpv/mission-domain';

import type { MissionRuntimeDiagnostic } from '../models/mission-runtime-diagnostics';
import type { LocationLoadProgress } from '../ports/location-definition-source.port';
import type { MissionFlightLaunchIntent } from '../models/mission-launch-intent';

export type MissionSessionLifecyclePhase =
  | 'idle'
  | 'preparing'
  | 'loading-location'
  | 'ready'
  | 'active'
  | 'paused'
  | 'infrastructure-failed'
  | 'exiting';

export interface MissionSessionFacadeState {
  readonly phase: MissionSessionLifecyclePhase;
  readonly missionId: string | null;
  readonly locationId: string | null;
  readonly sessionGeneration: number | null;
  readonly aircraftId: string | null;
  readonly aircraftCapabilities: MissionAircraftCapabilities | null;
  readonly compatibilityWarnings: readonly string[];
  readonly diagnostics: readonly MissionRuntimeDiagnostic[];
  readonly locationProgress: LocationLoadProgress;
  readonly launchIntent: MissionFlightLaunchIntent | null;
}

const IDLE_PROGRESS: LocationLoadProgress = {
  stage: 'idle',
  fraction: 0,
};

function idleState(): MissionSessionFacadeState {
  return {
    phase: 'idle',
    missionId: null,
    locationId: null,
    sessionGeneration: null,
    aircraftId: null,
    aircraftCapabilities: null,
    compatibilityWarnings: [],
    diagnostics: [],
    locationProgress: IDLE_PROGRESS,
    launchIntent: null,
  };
}

/**
 * Thin Angular facade for mission session lifecycle identity and diagnostics.
 * Does not calculate photography scores, raycast, own Three/Rapier, or own the flight loop.
 */
@Injectable({ providedIn: 'root' })
export class MissionSessionFacade {
  private readonly stateSignal = signal<MissionSessionFacadeState>(idleState());

  readonly state = this.stateSignal.asReadonly();

  snapshot(): MissionSessionFacadeState {
    return this.stateSignal();
  }

  beginPreparation(intent: MissionFlightLaunchIntent, sessionGeneration: number): void {
    this.stateSignal.set({
      ...idleState(),
      phase: 'preparing',
      missionId: intent.missionId,
      locationId: intent.locationId,
      aircraftId: intent.aircraftId,
      sessionGeneration,
      launchIntent: intent,
      locationProgress: { stage: 'resolving-definition', fraction: 0.05 },
    });
  }

  setAircraftCapabilities(
    capabilities: MissionAircraftCapabilities,
    warnings: readonly string[] = [],
  ): void {
    this.patch({
      aircraftCapabilities: capabilities,
      aircraftId: capabilities.aircraftId,
      compatibilityWarnings: [...warnings],
    });
  }

  setLocationProgress(progress: LocationLoadProgress): void {
    this.patch({
      locationProgress: progress,
      phase:
        progress.stage === 'ready'
          ? 'ready'
          : progress.stage === 'failed'
            ? 'infrastructure-failed'
            : progress.stage === 'loading-assets' ||
                progress.stage === 'validating' ||
                progress.stage === 'installing-runtime' ||
                progress.stage === 'resolving-definition'
              ? 'loading-location'
              : this.stateSignal().phase,
    });
  }

  markReady(): void {
    this.patch({
      phase: 'ready',
      locationProgress: { stage: 'ready', fraction: 1 },
    });
  }

  markActive(): void {
    this.patch({ phase: 'active' });
  }

  markPaused(): void {
    this.patch({ phase: 'paused' });
  }

  markResumed(): void {
    this.patch({ phase: 'active' });
  }

  reportFailure(diagnostic: MissionRuntimeDiagnostic): void {
    const current = this.stateSignal();
    this.stateSignal.set({
      ...current,
      phase: 'infrastructure-failed',
      diagnostics: [...current.diagnostics, diagnostic],
      locationProgress:
        diagnostic.code.startsWith('LOCATION_')
          ? { stage: 'failed', fraction: current.locationProgress.fraction, message: diagnostic.message }
          : current.locationProgress,
    });
  }

  beginExit(): void {
    this.patch({ phase: 'exiting' });
  }

  /**
   * Full reset so free flight after a mission does not inherit mission state.
   */
  reset(): void {
    this.stateSignal.set(idleState());
  }

  private patch(partial: Partial<MissionSessionFacadeState>): void {
    this.stateSignal.set({ ...this.stateSignal(), ...partial });
  }
}
