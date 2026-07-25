import type { AircraftId } from './aircraft-ids';
import type { AircraftDefinition } from './aircraft-definition.model';
import type { AircraftNormalizedStats } from './aircraft-stats.model';

/** Active aircraft bundle loaded into the single simulator runtime. */
export interface AircraftRuntime {
  aircraftId: AircraftId;
  definition: AircraftDefinition;
  liveryId: string;
  loadedAt: number;
  stats: AircraftNormalizedStats;
  warnings: string[];
}

export interface AircraftTelemetrySnapshot {
  loadedAircraftAssets: number;
  totalGeometryCount: number;
  textureMemoryEstimateBytes: number;
  activeAudioNodes: number;
  lastAircraftSwitchMs: number;
  lastModelLoadMs: number;
  lastColliderRebuildMs: number;
}
