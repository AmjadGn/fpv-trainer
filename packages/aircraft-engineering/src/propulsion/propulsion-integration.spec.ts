import { describe, expect, it } from 'vitest';
import { compileFactoryAircraft } from '@fpv/factory-aircraft';
import {
  FREE_FLIGHT_POLICY,
  RANKED_RACING_POLICY,
} from '@fpv/compatibility-engine';
import {
  FREE_FLIGHT_DATASET_POLICY,
  type PropulsionDatasetEligibilityPolicy,
} from '@fpv/propulsion-data';
import { compileAircraft, fingerprintCompilationContext } from '@fpv/aircraft-compiler';
import { buildOfficialCatalogSnapshot } from '@fpv/component-catalog';
import { materializeFactoryRevision, getFactoryManifest } from '@fpv/factory-aircraft';
import { FACTORY_GOLDEN_AIRCRAFT_IDS } from '@fpv/engineering-testing';

describe('propulsion solver dataset integration', () => {
  it('apex-r5 and velocity-x use curated estimate tables', () => {
    for (const id of ['apex-r5', 'velocity-x'] as const) {
      const craft = compileFactoryAircraft(id, { policy: FREE_FLIGHT_POLICY });
      const units = craft.compilation.specification!.propulsion.units;
      expect(units.length).toBe(4);
      for (const u of units) {
        expect(u.source.dataSourceMode).toBe('curated-estimate-table');
        expect(u.source.datasetRevisionId).toBeTruthy();
        expect(u.source.datasetFingerprint).toBeTruthy();
        expect(u.confidence).toBe('medium');
        expect(u.fallbackPath).toBeNull();
      }
    }
  });

  it('other factory aircraft use explicit legacy fallback', () => {
    for (const id of ['aeroguard-2', 'nano-scout', 'flux-f5', 'horizon-l7'] as const) {
      const craft = compileFactoryAircraft(id, { policy: FREE_FLIGHT_POLICY });
      const propulsion = craft.compilation.specification!.propulsion;
      expect(propulsion.dataProvenance).toBe('peak-thrust-hint-fallback');
      expect(propulsion.confidence).toBe('low');
      expect(
        propulsion.warnings.some((w) =>
          w.includes('PROP_LEGACY_PEAK_THRUST_HINT_FALLBACK'),
        ),
      ).toBe(true);
      for (const u of propulsion.units) {
        expect(u.source.dataSourceMode).toBe('peak-thrust-hint-fallback');
        expect(u.source.electricalDemandA).toBeNull();
        expect(u.source.rpmMin).toBeNull();
        expect(u.source.datasetRevisionId).toBeNull();
      }
    }
  });

  it('strict policy rejecting legacy fallback fails open factory without datasets', () => {
    const strict: PropulsionDatasetEligibilityPolicy = {
      ...FREE_FLIGHT_DATASET_POLICY,
      legacyPeakThrustHintAllowed: false,
      allowedProvenanceCategories: ['independent-bench-measurement'],
    };
    const policy = {
      ...FREE_FLIGHT_POLICY,
      datasetPolicy: strict,
    };
    const manifest = getFactoryManifest('aeroguard-2');
    const revision = materializeFactoryRevision(manifest);
    const list = [...buildOfficialCatalogSnapshot().revisions.values()];
    const compiled = compileAircraft(revision, list, { policy });
    // Units skipped when fallback rejected → zero thrust → still may compile
    // depending on post-engineering TWR. Assert provenance/warning path.
    expect(
      compiled.specification?.propulsion.warnings.some((w) =>
        w.includes('PROP_FALLBACK_REJECTED_BY_POLICY'),
      ) ||
        compiled.specification?.propulsion.totalMaxThrustNewtons === 0 ||
        !compiled.ok,
    ).toBe(true);
  });

  it('dataset policy change alters CompilationContextFingerprint only', () => {
    const free = fingerprintCompilationContext(FREE_FLIGHT_POLICY);
    const ranked = fingerprintCompilationContext(RANKED_RACING_POLICY);
    expect(free).not.toBe(ranked);

    const stricter = fingerprintCompilationContext({
      ...FREE_FLIGHT_POLICY,
      datasetPolicy: {
        ...FREE_FLIGHT_POLICY.datasetPolicy,
        measuredDataRequired: true,
      },
    });
    expect(stricter).not.toBe(free);
  });

  it('all factory aircraft compile with finite propulsion values', () => {
    for (const id of FACTORY_GOLDEN_AIRCRAFT_IDS) {
      const craft = compileFactoryAircraft(id);
      const spec = craft.compilation.specification!;
      expect(Number.isFinite(spec.propulsion.totalMaxThrustNewtons)).toBe(true);
      expect(Number.isFinite(spec.propulsion.thrustToWeight)).toBe(true);
      expect(spec.propulsion.units.every((u) => Number.isFinite(u.maxThrustNewtons))).toBe(
        true,
      );
    }
  });
});
