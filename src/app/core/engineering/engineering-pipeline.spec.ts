import { describe, expect, it } from 'vitest';

import { OFFICIAL_COMPONENT_REVISIONS, buildOfficialCatalogSnapshot } from '@fpv/component-catalog';
import { compileAircraft } from '@fpv/aircraft-compiler';
import { executeValidation, FREE_FLIGHT_POLICY, RANKED_RACING_POLICY } from '@fpv/compatibility-engine';
import {
  compileAllFactoryAircraft,
  compileFactoryAircraft,
  materializeFactoryRevision,
  getFactoryManifest,
  validateAllFactoryManifests,
} from '@fpv/factory-aircraft';
import { aggregateMass } from '@fpv/aircraft-engineering';
import { createMemoryCompilationCache } from '@fpv/aircraft-compiler';
import {
  createMemoryArtifactRepository,
  createMemoryBuildRepository,
} from '@fpv/drone-build-persistence';
import { asDroneBuildId } from '@fpv/engineering-kernel';
import { createDraft, publishRevision } from '@fpv/drone-build-domain';

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
      expect(craft.compilation.specification?.artifactFingerprint).toBeTruthy();
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
    const components = new Map(
      [...snap.revisions.entries()].map(([k, v]) => [k as string, v]),
    );
    const validation = executeValidation(revision, components, FREE_FLIGHT_POLICY);
    expect(validation.canCompile).toBe(false);
    expect(validation.issues.some((i) => i.ruleCode === 'ELEC_VOLTAGE_COMPAT')).toBe(
      true,
    );
  });

  it('applies ranked racing policy cell limits', () => {
    // Horizon uses 6S — allowed. Create a hypothetical by using free policy then ranked.
    const craft = compileFactoryAircraft('horizon-l7');
    expect(craft.physics.batteryCellCount).toBe(6);
    const revision = materializeFactoryRevision(getFactoryManifest('horizon-l7'));
    const snap = buildOfficialCatalogSnapshot();
    const components = new Map(
      [...snap.revisions.entries()].map(([k, v]) => [k as string, v]),
    );
    const ranked = executeValidation(revision, components, RANKED_RACING_POLICY);
    // Horizon exceeds 0.85kg takeoff typically — may warn/error on mass if we add that rule later.
    // Cell count 6 is at max — should pass cell rule.
    expect(
      ranked.issues.every((i) => i.ruleCode !== 'RULESET_MAX_CELLS'),
    ).toBe(true);
  });

  it('never increases mass when removing a component selection', () => {
    const craft = compileFactoryAircraft('flux-f5');
    const revision = materializeFactoryRevision(getFactoryManifest('flux-f5'));
    const snap = buildOfficialCatalogSnapshot();
    const components = new Map(
      [...snap.revisions.entries()].map(([k, v]) => [k as string, v]),
    );
    const full = aggregateMass(revision.selections, components);
    const withoutCamera = revision.selections.filter((s) => s.selectionId !== 'camera');
    const reduced = aggregateMass(withoutCamera, components);
    expect(reduced.totalTakeoffMassKg).toBeLessThanOrEqual(full.totalTakeoffMassKg);
    expect(craft.physics.takeoffMassKg).toBeGreaterThan(0);
  });

  it('uses compilation cache by fingerprint', () => {
    const cache = createMemoryCompilationCache();
    const revision = materializeFactoryRevision(getFactoryManifest('apex-r5'));
    const snap = buildOfficialCatalogSnapshot();
    const list = [...snap.revisions.values()];
    const first = compileAircraft(revision, list, { cache, collectTrace: true });
    const second = compileAircraft(revision, list, { cache, collectTrace: true });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.trace.some((t) => t.stage === 'cache-hit')).toBe(true);
  });

  it('persists builds in memory repositories', async () => {
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
    await builds.saveRevision(revision);
    const craft = compileFactoryAircraft('apex-r5');
    const spec = craft.compilation.specification!;
    await artifacts.save({
      buildFingerprint: spec.buildFingerprint,
      artifactFingerprint: spec.artifactFingerprint,
      engineeringModelVersion: spec.versionManifest.engineeringModelVersion,
      compilerVersion: spec.versionManifest.compilerVersion,
      specification: spec,
      createdAtIso: null,
      trustStatus: 'local',
    });
    const cached = await artifacts.get(
      spec.buildFingerprint,
      spec.versionManifest.engineeringModelVersion,
      spec.versionManifest.compilerVersion,
    );
    expect(cached?.artifactFingerprint).toBe(spec.artifactFingerprint);
  });
});
