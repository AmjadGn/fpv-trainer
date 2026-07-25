import { describe, expect, it } from 'vitest';

import { AIRCRAFT_CATALOG, listInternalReferenceProfiles } from './aircraft-catalog';
import { COMMERCIAL_AIRCRAFT_DEFINITIONS } from './commercial-aircraft-definitions';
import { AIRCRAFT_IDS } from '../models/aircraft-ids';
import { validateAircraftDefinition } from '../validators/aircraft-definition.validator';
import { flightProfileToAppliedConfig } from '../adapters/flight-profile.adapter';
import { AircraftStatsService } from '../services/aircraft-stats.service';

describe('Aircraft catalog', () => {
  it('loads six unique commercial aircraft', () => {
    expect(COMMERCIAL_AIRCRAFT_DEFINITIONS).toHaveLength(6);
    const ids = new Set(COMMERCIAL_AIRCRAFT_DEFINITIONS.map((a) => a.id));
    const slugs = new Set(COMMERCIAL_AIRCRAFT_DEFINITIONS.map((a) => a.slug));
    expect(ids.size).toBe(6);
    expect(slugs.size).toBe(6);
  });

  it('does not expose reference profiles in production catalog', () => {
    for (const a of AIRCRAFT_CATALOG) {
      expect(a.fictionalManufacturer).toBe(true);
      expect(a.id.startsWith('ref-')).toBe(false);
    }
    const refs = listInternalReferenceProfiles();
    expect(refs.every((r) => r.internalOnly)).toBe(true);
  });

  it('validates all definitions', () => {
    for (const def of AIRCRAFT_CATALOG) {
      const result = validateAircraftDefinition(def);
      expect(result.ok, `${def.id}: ${result.errors.join('; ')}`).toBe(true);
    }
  });

  it('has distinguishable flight profiles', () => {
    const apex = AIRCRAFT_CATALOG.find((a) => a.id === AIRCRAFT_IDS.apexR5)!;
    const aero = AIRCRAFT_CATALOG.find((a) => a.id === AIRCRAFT_IDS.aeroGuard2)!;
    const horizon = AIRCRAFT_CATALOG.find((a) => a.id === AIRCRAFT_IDS.horizonL7)!;
    const nano = AIRCRAFT_CATALOG.find((a) => a.id === AIRCRAFT_IDS.nanoScout)!;
    const velocity = AIRCRAFT_CATALOG.find((a) => a.id === AIRCRAFT_IDS.velocityX)!;

    expect(apex.flightProfile.maxRollRate).toBeGreaterThan(
      aero.flightProfile.maxRollRate,
    );
    expect(horizon.flightProfile.rollInertia).toBeGreaterThan(
      apex.flightProfile.rollInertia,
    );
    expect(nano.flightProfile.windSensitivity).toBeGreaterThan(
      velocity.flightProfile.windSensitivity,
    );
    expect(velocity.flightProfile.maxVelocity).toBeGreaterThan(
      aero.flightProfile.maxVelocity,
    );
  });

  it('derives stats from physics, not hand-authored UI values', () => {
    const stats = new AircraftStatsService();
    const apex = AIRCRAFT_CATALOG.find((a) => a.id === AIRCRAFT_IDS.apexR5)!;
    const aero = AIRCRAFT_CATALOG.find((a) => a.id === AIRCRAFT_IDS.aeroGuard2)!;
    const a = stats.derive(apex);
    const b = stats.derive(aero);
    expect(a.agility).toBeGreaterThan(b.agility);
    expect(b.beginnerFriendliness).toBeGreaterThan(a.beginnerFriendliness);
  });

  it('adapts flight profile into applied config with finite values', () => {
    for (const def of AIRCRAFT_CATALOG) {
      const applied = flightProfileToAppliedConfig(def);
      expect(Number.isFinite(applied.mass)).toBe(true);
      expect(applied.mass).toBeGreaterThan(0);
      expect(Number.isFinite(applied.maxThrust)).toBe(true);
      expect(applied.maxThrust).toBeGreaterThan(0);
      expect(Number.isFinite(applied.angularResponse)).toBe(true);
    }
  });
});
