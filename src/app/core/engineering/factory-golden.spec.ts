import { describe, expect, it } from 'vitest';
import { compileFactoryAircraft } from '@fpv/factory-aircraft';
import { FACTORY_GOLDEN_AIRCRAFT_IDS } from './golden-files/factory-ids';

describe('factory golden masters', () => {
  it('produces stable fingerprints for all factory aircraft', () => {
    const fingerprints = FACTORY_GOLDEN_AIRCRAFT_IDS.map((id) => {
      const craft = compileFactoryAircraft(id);
      return {
        id,
        build: craft.compilation.specification!.buildFingerprint,
        artifact: craft.compilation.specification!.artifactFingerprint,
        mass: craft.physics.takeoffMassKg,
        thrust: craft.physics.maximumThrustNewtons,
      };
    });

    // Recompile and compare — golden invariant is self-consistency.
    for (const row of fingerprints) {
      const again = compileFactoryAircraft(row.id);
      expect(again.compilation.specification!.buildFingerprint).toBe(row.build);
      expect(again.compilation.specification!.artifactFingerprint).toBe(
        row.artifact,
      );
      expect(again.physics.takeoffMassKg).toBe(row.mass);
      expect(again.physics.maximumThrustNewtons).toBe(row.thrust);
    }

    // Fingerprints must be unique across factory aircraft.
    const builds = new Set(fingerprints.map((f) => f.build));
    const artifacts = new Set(fingerprints.map((f) => f.artifact));
    expect(builds.size).toBe(FACTORY_GOLDEN_AIRCRAFT_IDS.length);
    expect(artifacts.size).toBe(FACTORY_GOLDEN_AIRCRAFT_IDS.length);
  });
});
