import { describe, expect, it } from 'vitest';
import { compileFactoryAircraft } from '@fpv/factory-aircraft';
import { FACTORY_GOLDEN_AIRCRAFT_IDS } from '@fpv/engineering-testing';
import { FREE_FLIGHT_POLICY } from '@fpv/compatibility-engine';

describe('factory runtime regression', () => {
  it('compiles and adapts every factory aircraft for the catalog runtime', () => {
    for (const id of FACTORY_GOLDEN_AIRCRAFT_IDS) {
      const craft = compileFactoryAircraft(id, { policy: FREE_FLIGHT_POLICY });
      expect(craft.compilation.ok).toBe(true);
      expect(craft.flightProfile.id).toBe(`flt-${id}`);
      expect(craft.flightProfile.massKg).toBeGreaterThan(0);
      expect(craft.physics.takeoffMassKg).toBeGreaterThan(0);
      expect(craft.physics.physicalInertiaKgM2!.roll).toBeGreaterThan(0);
      expect(Number.isFinite(craft.flightProfile.maxRollRate)).toBe(true);
    }
  });
});
