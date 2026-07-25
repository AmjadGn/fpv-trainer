import type { AircraftId } from './aircraft-ids';
import type { AircraftCategory } from './aircraft-definition.model';

/**
 * Competitive event aircraft policy.
 * Events must declare how aircraft are allowed on a leaderboard.
 */
export type AircraftPolicyKind =
  | 'unrestricted'
  | 'fixedAircraft'
  | 'allowedAircraftList'
  | 'aircraftClass'
  | 'normalizedPerformance'
  | 'separateLeaderboardPerAircraft';

export interface AircraftPolicy {
  kind: AircraftPolicyKind;
  fixedAircraftId?: AircraftId;
  allowedAircraftIds?: AircraftId[];
  allowedClasses?: AircraftCategory[];
  /** When true, leaderboard keys include aircraftId. */
  separateLeaderboards?: boolean;
  requirePhysicsVersionMatch?: boolean;
  requireColliderVersionMatch?: boolean;
}

export interface CompetitiveAircraftStamp {
  aircraftId: AircraftId;
  physicsProfileVersion: string;
  colliderVersion: string;
  rateProfileId: string;
  cameraAngleDeg?: number;
  definitionVersion: string;
}

/** Remote catalog overlay — cannot silently replace local physics. */
export interface RemoteAircraftCatalogEntry {
  aircraftId: AircraftId;
  displayName?: string;
  availability: 'available' | 'disabled' | 'maintenance';
  releaseStatus?: string;
  requiredClientVersion?: string;
  supportedPhysicsVersion?: string;
  supportedColliderVersion?: string;
  competitiveAllowed: boolean;
  unlockPolicy?: string;
  featureFlag?: string;
  maintenanceStatus?: string;
}
