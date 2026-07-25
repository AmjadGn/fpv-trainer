import type { AircraftId } from '../models/aircraft-ids';
import type { AircraftCategory } from '../models/aircraft-definition.model';
import type {
  AircraftPolicy,
  CompetitiveAircraftStamp,
} from '../models/aircraft-policy.model';
import type { AircraftDefinition } from '../models/aircraft-definition.model';

export function isAircraftAllowed(
  policy: AircraftPolicy,
  aircraftId: AircraftId,
  category?: AircraftCategory,
): boolean {
  switch (policy.kind) {
    case 'unrestricted':
    case 'normalizedPerformance':
    case 'separateLeaderboardPerAircraft':
      return true;
    case 'fixedAircraft':
      return policy.fixedAircraftId === aircraftId;
    case 'allowedAircraftList':
      return (policy.allowedAircraftIds ?? []).includes(aircraftId);
    case 'aircraftClass':
      return !!category && (policy.allowedClasses ?? []).includes(category);
    default:
      return true;
  }
}

export function stampCompetitiveAircraft(
  def: AircraftDefinition,
  rateProfileId: string,
  cameraAngleDeg?: number,
): CompetitiveAircraftStamp {
  return {
    aircraftId: def.id,
    physicsProfileVersion: def.physicsProfileVersion,
    colliderVersion: def.colliderVersion,
    rateProfileId,
    cameraAngleDeg,
    definitionVersion: def.definitionVersion,
  };
}

export function leaderboardKeyForPolicy(
  policy: AircraftPolicy,
  baseKey: string,
  aircraftId: AircraftId,
): string {
  if (
    policy.kind === 'separateLeaderboardPerAircraft' ||
    policy.separateLeaderboards
  ) {
    return `${baseKey}::${aircraftId}`;
  }
  if (policy.kind === 'fixedAircraft' && policy.fixedAircraftId) {
    return `${baseKey}::${policy.fixedAircraftId}`;
  }
  return baseKey;
}
