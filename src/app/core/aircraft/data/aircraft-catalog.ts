import { COMMERCIAL_AIRCRAFT_DEFINITIONS } from './commercial-aircraft-definitions';
import { REFERENCE_AIRCRAFT_PROFILES } from './reference-aircraft-profiles';
import {
  DEFAULT_AIRCRAFT_ID,
  LEGACY_FALLBACK_AIRCRAFT_ID,
  type AircraftId,
} from '../models/aircraft-ids';
import type { AircraftDefinition } from '../models/aircraft-definition.model';

/**
 * Production catalog — commercial aircraft only.
 * Reference profiles are never included here.
 */
export const AIRCRAFT_CATALOG: AircraftDefinition[] =
  COMMERCIAL_AIRCRAFT_DEFINITIONS;

export const AIRCRAFT_CATALOG_VERSION = '1.0.0';

export function listProductionAircraft(): AircraftDefinition[] {
  return AIRCRAFT_CATALOG.filter(
    (a) => a.releaseStatus === 'available' && a.unlockPolicy !== 'dev-only',
  );
}

export function findAircraftById(
  id: string | null | undefined,
): AircraftDefinition | undefined {
  if (!id) {
    return undefined;
  }
  return AIRCRAFT_CATALOG.find((a) => a.id === id || a.slug === id);
}

export function resolveAircraftId(
  id: string | null | undefined,
): AircraftId {
  const found = findAircraftById(id);
  return found?.id ?? DEFAULT_AIRCRAFT_ID;
}

export function getLegacyFallbackAircraft(): AircraftDefinition {
  return (
    findAircraftById(LEGACY_FALLBACK_AIRCRAFT_ID) ??
    AIRCRAFT_CATALOG[0]
  );
}

/** Dev-only accessor — never wire into production UI. */
export function listInternalReferenceProfiles() {
  return REFERENCE_AIRCRAFT_PROFILES;
}
