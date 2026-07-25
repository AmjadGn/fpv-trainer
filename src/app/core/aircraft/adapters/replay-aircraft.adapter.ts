import type { FlightReplay, ReplayMetadata } from '../../replay/models/replay.model';
import {
  getLegacyFallbackAircraft,
  resolveAircraftId,
} from '../data/aircraft-catalog';
import type { AircraftDefinition } from '../models/aircraft-definition.model';
import type { AircraftId } from '../models/aircraft-ids';

export interface ReplayAircraftMetadata {
  aircraftId: AircraftId;
  aircraftDefinitionVersion: string;
  physicsProfileVersion: string;
  colliderVersion: string;
  visualVersion: string;
  liveryId: string;
  cameraProfileId: string;
  rateProfileId: string;
}

export function stampReplayAircraftMetadata(
  def: AircraftDefinition,
  rateProfileId: string,
  liveryId?: string,
): ReplayAircraftMetadata {
  return {
    aircraftId: def.id,
    aircraftDefinitionVersion: def.definitionVersion,
    physicsProfileVersion: def.physicsProfileVersion,
    colliderVersion: def.colliderVersion,
    visualVersion: def.visualVersion,
    liveryId: liveryId ?? def.visualProfile.defaultLiveryId,
    cameraProfileId: def.cameraProfile.id,
    rateProfileId,
  };
}

export function resolveReplayAircraft(
  metadata: ReplayMetadata | undefined,
): { aircraftId: AircraftId; legacyFallback: boolean } {
  const raw = (metadata as ReplayMetadata & { aircraftId?: string } | undefined)
    ?.aircraftId;
  if (!raw) {
    return {
      aircraftId: getLegacyFallbackAircraft().id,
      legacyFallback: true,
    };
  }
  return { aircraftId: resolveAircraftId(raw), legacyFallback: false };
}

export function attachAircraftToReplay(
  replay: FlightReplay,
  stamp: ReplayAircraftMetadata,
): FlightReplay {
  return {
    ...replay,
    metadata: {
      ...replay.metadata,
      ...stamp,
    },
  };
}
