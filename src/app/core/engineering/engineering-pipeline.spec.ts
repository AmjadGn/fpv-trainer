import { describe, expect, it } from 'vitest';

import { OFFICIAL_COMPONENT_REVISIONS, buildOfficialCatalogSnapshot } from '@fpv/component-catalog';
import {
  compileAircraft,
  createMemoryCompilationCache,
  fingerprintCompilationContext,
  normalizeBuildRevision,
} from '@fpv/aircraft-compiler';
import {
  executeValidation,
  FREE_FLIGHT_POLICY,
  RANKED_RACING_POLICY,
} from '@fpv/compatibility-engine';
import {
  compileAllFactoryAircraft,
  compileFactoryAircraft,
  materializeFactoryRevision,
  getFactoryManifest,
  validateAllFactoryManifests,
} from '@fpv/factory-aircraft';
import { aggregateMass } from '@fpv/aircraft-engineering';
import {
  createMemoryArtifactRepository,
  createMemoryBuildRepository,
} from '@fpv/drone-build-persistence';
import { asDroneBuildId } from '@fpv/engineering-kernel';
import {
  createDraft,
  publishRevision,
  resolveAssembly,
} from '@fpv/drone-build-domain';
describe('drone builder engineering core', () => {
  it('has official catalog revisions', () => {
    expect(OFFICIAL_COMPONENT_REVISIONS.length).toBeGreaterThan(20);
    const snap = buildOfficialCatalogSnapshot();
    expect(snap.release.version).toBe('1.1.0');
  });

  it('validates and compiles all factory aircraft', () => {
    const result = validateAllFactoryManifests();
    expect(result.ok, result.failures.join('\n')).toBe(true);
    const all = compileAllFactoryAircraft();
    expect(all).toHaveLength(6);
    for (const craft of all) {
      expect(craft.compilation.ok).toBe(true);
      expect(craft.physics.takeoffMassKg).toBeGreaterThan(0);
      expect(craft.flightProfile.maxThrustNewtons).toBeGreaterThan(0);
      expect(craft.compilation.specification?.buildFingerprint).toBeTruthy();
      expect(craft.compilation.specification?.compilationContextFingerprint).toBeTruthy();
      expect(craft.compilation.specification?.artifactFingerprint).toBeTruthy();
      expect(craft.physics.physicalInertiaKgM2?.roll).toBeGreaterThan(0);
    }
  });

  it('is deterministic across repeated compilations', () => {
    const a = compileFactoryAircraft('apex-r5');
    const b = compileFactoryAircraft('apex-r5');
    expect(a.compilation.specification?.buildFingerprint).toBe(
      b.compilation.specification?.buildFingerprint,
    );
    expect(a.compilation.specification?.artifactFingerprint).toBe(
      b.compilation.specification?.artifactFingerprint,
    );
    expect(a.physics.takeoffMassKg).toBe(b.physics.takeoffMassKg);
    expect(a.flightProfile.maxRollRate).toBe(b.flightProfile.maxRollRate);
  });

  it('distinguishes factory flight characters', () => {
    const apex = compileFactoryAircraft('apex-r5');
    const aero = compileFactoryAircraft('aeroguard-2');
    const horizon = compileFactoryAircraft('horizon-l7');
    const nano = compileFactoryAircraft('nano-scout');
    const velocity = compileFactoryAircraft('velocity-x');

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

  it('rejects invalid voltage builds', () => {
    const manifest = getFactoryManifest('nano-scout');
    const broken = {
      ...manifest,
      batteryRevisionId: 'batt-6s-1500@1',
      buildId: 'broken-nano',
      revisionId: 'broken-nano@1',
    };
    const revision = materializeFactoryRevision(broken);
    const snap = buildOfficialCatalogSnapshot();
    const assembly = resolveAssembly(normalizeBuildRevision(revision), snap.revisions);
    const validation = executeValidation(assembly, FREE_FLIGHT_POLICY);
    expect(validation.canCompile).toBe(false);
    expect(validation.issues.some((i) => i.ruleCode === 'ELEC_VOLTAGE_COMPAT')).toBe(
      true,
    );
  });

  it('applies ranked racing policy cell limits', () => {
    const craft = compileFactoryAircraft('horizon-l7');
    expect(craft.physics.batteryCellCount).toBe(6);
    const revision = materializeFactoryRevision(getFactoryManifest('horizon-l7'));
    const snap = buildOfficialCatalogSnapshot();
    const assembly = resolveAssembly(normalizeBuildRevision(revision), snap.revisions);
    const ranked = executeValidation(assembly, RANKED_RACING_POLICY);
    expect(
      ranked.issues.every((i) => i.ruleCode !== 'RULESET_MAX_CELLS'),
    ).toBe(true);
  });

  it('never increases mass when removing a component selection', () => {
    const craft = compileFactoryAircraft('flux-f5');
    const revision = materializeFactoryRevision(getFactoryManifest('flux-f5'));
    const snap = buildOfficialCatalogSnapshot();
    const fullAssembly = resolveAssembly(normalizeBuildRevision(revision), snap.revisions);
    const full = aggregateMass(fullAssembly);
    const withoutCamera = {
      ...revision,
      selections: revision.selections.filter((s) => s.selectionId !== 'camera'),
    };
    const reducedAssembly = resolveAssembly(
      normalizeBuildRevision(withoutCamera),
      snap.revisions,
    );
    const reduced = aggregateMass(reducedAssembly);
    expect(reduced.totalTakeoffMassKg).toBeLessThanOrEqual(full.totalTakeoffMassKg);
    expect(craft.physics.takeoffMassKg).toBeGreaterThan(0);
  });

  it('uses compilation cache by fingerprint and refuses cross-policy hits', () => {
    const cache = createMemoryCompilationCache();
    const revision = materializeFactoryRevision(getFactoryManifest('apex-r5'));
    const snap = buildOfficialCatalogSnapshot();
    const list = [...snap.revisions.values()];
    const first = compileAircraft(revision, list, {
      cache,
      collectTrace: true,
      policy: FREE_FLIGHT_POLICY,
    });
    const second = compileAircraft(revision, list, {
      cache,
      collectTrace: true,
      policy: FREE_FLIGHT_POLICY,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.trace.some((t) => t.stage === 'cache-hit')).toBe(true);

    const ranked = compileAircraft(revision, list, {
      cache,
      collectTrace: true,
      policy: RANKED_RACING_POLICY,
    });
    expect(ranked.trace.some((t) => t.stage === 'cache-hit')).toBe(false);
  });

  it('persists builds in memory repositories with immutable insert', async () => {
    const builds = createMemoryBuildRepository();
    const artifacts = createMemoryArtifactRepository();
    const draft = createDraft({
      buildId: 'user-draft-1',
      name: 'My Draft',
      catalogReleaseId: buildOfficialCatalogSnapshot().release.releaseId,
      selections: [],
      topology: [],
    });
    await builds.saveDraft(draft);
    const loaded = await builds.getDraft(asDroneBuildId('user-draft-1'));
    expect(loaded?.name).toBe('My Draft');

    const revision = publishRevision(draft, 'user-draft-1@1');
    await builds.insertRevision(revision);
    await builds.insertRevision(revision); // idempotent
    const mutated = {
      ...revision,
      tuning: { ...revision.tuning, thrustCurveExponent: 9 },
    };
    await expect(builds.insertRevision(mutated)).rejects.toThrow(
      /REVISION_IMMUTABLE_CONFLICT|Cannot overwrite published revision/,
    );

    const craft = compileFactoryAircraft('apex-r5');
    const spec = craft.compilation.specification!;
    await artifacts.save({
      buildFingerprint: spec.buildFingerprint,
      compilationContextFingerprint: spec.compilationContextFingerprint,
      artifactFingerprint: spec.artifactFingerprint,
      engineeringModelVersion: spec.versionManifest.engineeringModelVersion,
      compilerVersion: spec.versionManifest.compilerVersion,
      specification: spec,
      createdAtIso: null,
      trustStatus: 'local',
    });
    const cached = await artifacts.get(
      spec.buildFingerprint,
      spec.compilationContextFingerprint,
      spec.versionManifest.engineeringModelVersion,
      spec.versionManifest.compilerVersion,
    );
    expect(cached?.artifactFingerprint).toBe(spec.artifactFingerprint);
  });

  it('derives frame dimensions from the active build, not the catalog order', () => {
    const apex = compileFactoryAircraft('apex-r5');
    const horizon = compileFactoryAircraft('horizon-l7');
    expect(apex.physics.wheelbaseMeters).not.toBe(horizon.physics.wheelbaseMeters);
    expect(apex.physics.propellerDiameterMeters).not.toBe(
      horizon.physics.propellerDiameterMeters,
    );

    const revision = materializeFactoryRevision(getFactoryManifest('apex-r5'));
    const snap = buildOfficialCatalogSnapshot();
    const reversed = [...snap.revisions.values()].reverse();
    const a = compileAircraft(revision, [...snap.revisions.values()]);
    const b = compileAircraft(revision, reversed);
    expect(a.specification?.physicalAssembly.dimensions.wheelbaseMeters).toBe(
      b.specification?.physicalAssembly.dimensions.wheelbaseMeters,
    );
    expect(a.specification?.buildFingerprint).toBe(b.specification?.buildFingerprint);
  });

  it('keeps fingerprints stable when unused catalog components are injected', () => {
    const revision = materializeFactoryRevision(getFactoryManifest('flux-f5'));
    const snap = buildOfficialCatalogSnapshot();
    const base = compileAircraft(revision, [...snap.revisions.values()]);
    const withExtra = compileAircraft(revision, [
      ...snap.revisions.values(),
      ...OFFICIAL_COMPONENT_REVISIONS,
    ]);
    expect(base.specification?.buildFingerprint).toBe(
      withExtra.specification?.buildFingerprint,
    );
    expect(base.specification?.physicalAssembly.totalMassKg).toBe(
      withExtra.specification?.physicalAssembly.totalMassKg,
    );
  });

  it('produces distinct free-flight vs ranked compilation context fingerprints', () => {
    const free = fingerprintCompilationContext(FREE_FLIGHT_POLICY);
    const ranked = fingerprintCompilationContext(RANKED_RACING_POLICY);
    expect(free).not.toBe(ranked);
    const reordered = fingerprintCompilationContext({
      ...FREE_FLIGHT_POLICY,
      allowedComponentSources: [...FREE_FLIGHT_POLICY.allowedComponentSources].reverse(),
    });
    expect(reordered).toBe(free);
    const tighter = fingerprintCompilationContext({
      ...FREE_FLIGHT_POLICY,
      minThrustToWeight: FREE_FLIGHT_POLICY.minThrustToWeight + 0.1,
    });
    expect(tighter).not.toBe(free);
  });

  it('shuffling topology and selections preserves fingerprints', () => {
    const revision = materializeFactoryRevision(getFactoryManifest('apex-r5'));
    const snap = buildOfficialCatalogSnapshot();
    const shuffled = {
      ...revision,
      selections: [...revision.selections].reverse(),
      topology: [...revision.topology].reverse(),
    };
    const a = compileAircraft(revision, [...snap.revisions.values()]);
    const b = compileAircraft(shuffled, [...snap.revisions.values()]);
    expect(a.specification?.buildFingerprint).toBe(b.specification?.buildFingerprint);
    expect(a.specification?.artifactFingerprint).toBe(
      b.specification?.artifactFingerprint,
    );
    expect(
      a.specification?.propulsion.units.map((u) => u.motorSelectionId),
    ).toEqual(b.specification?.propulsion.units.map((u) => u.motorSelectionId));
  });
});
