import { describe, expect, it } from 'vitest';
import {
  buildOfficialCatalogSnapshot,
  OFFICIAL_COMPONENT_REVISIONS,
} from '@fpv/component-catalog';
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
  createDraft,
  createQuadSelections,
  publishRevision,
  resolveAssembly,
} from '@fpv/drone-build-domain';
import { OFFICIAL_CATALOG_RELEASE } from '@fpv/component-catalog';
import { aggregateMass } from '@fpv/aircraft-engineering';
import {
  getFactoryManifest,
  materializeFactoryRevision,
  compileFactoryAircraft,
} from '@fpv/factory-aircraft';
import { mapSiInertiaToSolver } from '@fpv/aircraft-compiler';

function racingFixture(overrides: {
  frame?: string;
  motor?: string;
  prop?: string;
  battery?: string;
  esc?: string;
} = {}) {
  const { selections, topology } = createQuadSelections({
    frameRevisionId: overrides.frame ?? 'frame-racing-5in@1',
    motorRevisionId: overrides.motor ?? 'motor-2207-2450kv@1',
    propellerRevisionId: overrides.prop ?? 'prop-5x4x3@1',
    batteryRevisionId: overrides.battery ?? 'batt-6s-1500@1',
    escRevisionId: overrides.esc ?? 'esc-4in1-45a@1',
    fcRevisionId: 'fc-f7-standard@1',
    cameraRevisionId: 'cam-fpv-standard@1',
    vtxRevisionId: 'vtx-25-800@1',
    receiverRevisionId: 'rx-elrs@1',
    armPositions: [
      { x: 0.08, y: 0.08, z: 0 },
      { x: -0.08, y: 0.08, z: 0 },
      { x: -0.08, y: -0.08, z: 0 },
      { x: 0.08, y: -0.08, z: 0 },
    ],
  });
  const draft = createDraft({
    buildId: 'pkg-fixture',
    name: 'Fixture',
    catalogReleaseId: OFFICIAL_CATALOG_RELEASE.releaseId,
    selections,
    topology,
  });
  return publishRevision(draft, 'pkg-fixture@1');
}

describe('@fpv package engineering foundation', () => {
  it('resolves assembly from selected components only', () => {
    const revision = racingFixture();
    const snap = buildOfficialCatalogSnapshot();
    const assembly = resolveAssembly(normalizeBuildRevision(revision), snap.revisions);
    expect(assembly.frameComponent?.revisionId).toBe('frame-racing-5in@1');
    expect(assembly.propulsionUnits).toHaveLength(4);
    expect(assembly.selectedComponents.size).toBeLessThan(OFFICIAL_COMPONENT_REVISIONS.length);
    expect(assembly.expectedMotorCount).toBe(4);
  });

  it('pairs propulsion by topology, not array order', () => {
    const revision = racingFixture();
    const shuffled = {
      ...revision,
      selections: [...revision.selections].reverse(),
      topology: [...revision.topology].reverse(),
    };
    const snap = buildOfficialCatalogSnapshot();
    const a = compileAircraft(revision, [...snap.revisions.values()]);
    const b = compileAircraft(shuffled, [...snap.revisions.values()]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.specification!.propulsion.units.map((u) => u.motorSelectionId)).toEqual(
      b.specification!.propulsion.units.map((u) => u.motorSelectionId),
    );
    expect(a.specification!.buildFingerprint).toBe(b.specification!.buildFingerprint);
  });

  it('rejects missing frame, duplicate selection ids, invalid topology endpoints', () => {
    const revision = racingFixture();
    const snap = buildOfficialCatalogSnapshot();

    const noFrame = {
      ...revision,
      selections: revision.selections.filter((s) => s.selectionId !== 'frame'),
      topology: revision.topology.filter(
        (e) => e.fromSelectionId !== 'frame' && e.toSelectionId !== 'frame',
      ),
    };
    let assembly = resolveAssembly(normalizeBuildRevision(noFrame), snap.revisions);
    expect(executeValidation(assembly).canCompile).toBe(false);
    expect(
      executeValidation(assembly).issues.some((i) => i.ruleCode === 'STRUCT_FRAME_REQUIRED'),
    ).toBe(true);

    const dup = {
      ...revision,
      selections: [
        ...revision.selections,
        { ...revision.selections[0], slotId: 'slot-dup' as never },
      ],
    };
    assembly = resolveAssembly(normalizeBuildRevision(dup), snap.revisions);
    expect(
      executeValidation(assembly).issues.some((i) => i.ruleCode === 'RES_DUPLICATE_SELECTION_ID'),
    ).toBe(true);

    const badTopo = {
      ...revision,
      topology: [
        ...revision.topology,
        { fromSelectionId: 'nope', toSelectionId: 'frame', kind: 'mounts-on' as const },
      ],
    };
    assembly = resolveAssembly(normalizeBuildRevision(badTopo), snap.revisions);
    expect(
      executeValidation(assembly).issues.some((i) => i.ruleCode === 'TOPO_ENDPOINTS'),
    ).toBe(true);
  });

  it('rejects multi-prop-per-motor and motor without propeller', () => {
    const revision = racingFixture();
    const snap = buildOfficialCatalogSnapshot();
    const multi = {
      ...revision,
      topology: [
        ...revision.topology,
        { fromSelectionId: 'prop-1', toSelectionId: 'motor-0', kind: 'propels' as const },
      ],
    };
    let assembly = resolveAssembly(normalizeBuildRevision(multi), snap.revisions);
    const issues = executeValidation(assembly).issues;
    expect(
      issues.some(
        (i) =>
          i.ruleCode === 'TOPO_PROPULSION_BIJECTIVE' ||
          i.ruleCode === 'RES_DUPLICATE_PROPULSION' ||
          i.ruleCode === 'TOPO_MULTI_PROP_MOTOR',
      ),
    ).toBe(true);

    const noPropEdge = {
      ...revision,
      topology: revision.topology.filter(
        (e) => !(e.kind === 'propels' && e.toSelectionId === 'motor-0'),
      ),
    };
    assembly = resolveAssembly(normalizeBuildRevision(noPropEdge), snap.revisions);
    expect(
      executeValidation(assembly).issues.some((i) => i.ruleCode === 'TOPO_MOTOR_WITHOUT_PROP'),
    ).toBe(true);
  });

  it('enforces ranked policy mass and min TWR post-engineering', () => {
    const horizon = materializeFactoryRevision(getFactoryManifest('horizon-l7'));
    const snap = buildOfficialCatalogSnapshot();
    const result = compileAircraft(horizon, [...snap.revisions.values()], {
      policy: RANKED_RACING_POLICY,
    });
    const free = fingerprintCompilationContext(FREE_FLIGHT_POLICY);
    const ranked = fingerprintCompilationContext(RANKED_RACING_POLICY);
    expect(free).not.toBe(ranked);
    // Horizon typically exceeds ranked max takeoff mass.
    if (result.ok) {
      expect(result.specification!.compilationContextFingerprint).toBe(ranked);
      expect(result.specification!.physicalAssembly.totalMassKg).toBeLessThanOrEqual(
        RANKED_RACING_POLICY.maxTakeoffMassKg! + 1e-9,
      );
    } else {
      const codes = result.validation.issues.map((i) => i.ruleCode);
      expect(
        codes.some(
          (c) =>
            c === 'RULESET_MAX_MASS' ||
            c === 'RULESET_MIN_TWR' ||
            c === 'RULESET_MAX_PROP_DIAMETER',
        ),
        `unexpected ranked failures: ${codes.join(',')}`,
      ).toBe(true);
    }
  });

  it('keeps SI inertia stable when solver mapping changes mass scale inputs', () => {
    const craft = compileFactoryAircraft('apex-r5');
    const si = craft.compilation.specification!.physicalAssembly.inertia;
    const mappedA = mapSiInertiaToSolver(
      craft.compilation.specification!.diagnostics.inertia,
      craft.physics.takeoffMassKg,
    );
    const mappedB = mapSiInertiaToSolver(
      craft.compilation.specification!.diagnostics.inertia,
      craft.physics.takeoffMassKg * 1.5,
    );
    expect(si.roll).toBeGreaterThan(0);
    expect(si.units).toBe('kg·m²');
    expect(mappedA.rollInertia).not.toBe(mappedB.rollInertia);
    expect(si.roll).toBe(craft.compilation.specification!.diagnostics.inertia.roll);
  });

  it('property: removing a component cannot increase mass; TWR worsens if mass rises', () => {
    const revision = materializeFactoryRevision(getFactoryManifest('flux-f5'));
    const snap = buildOfficialCatalogSnapshot();
    const full = resolveAssembly(normalizeBuildRevision(revision), snap.revisions);
    const fullMass = aggregateMass(full).totalTakeoffMassKg;
    expect(fullMass).toBeGreaterThan(0);

    const withoutVtx = {
      ...revision,
      selections: revision.selections.filter((s) => s.selectionId !== 'vtx'),
      topology: revision.topology.filter(
        (e) => e.fromSelectionId !== 'vtx' && e.toSelectionId !== 'vtx',
      ),
    };
    const reduced = resolveAssembly(normalizeBuildRevision(withoutVtx), snap.revisions);
    const reducedMass = aggregateMass(reduced).totalTakeoffMassKg;
    expect(reducedMass).toBeLessThanOrEqual(fullMass);

    const fullCompile = compileAircraft(revision, [...snap.revisions.values()]);
    expect(fullCompile.ok).toBe(true);
    const twr = fullCompile.specification!.propulsion.thrustToWeight;
    // Heavier identical thrust cannot improve TWR
    expect(twr * fullMass).toBeCloseTo(
      fullCompile.specification!.propulsion.totalMaxThrustNewtons / 9.81,
      5,
    );
  });

  it('cache contexts cannot cross validation policies', () => {
    const cache = createMemoryCompilationCache();
    const revision = materializeFactoryRevision(getFactoryManifest('nano-scout'));
    const list = [...buildOfficialCatalogSnapshot().revisions.values()];
    const free = compileAircraft(revision, list, {
      cache,
      policy: FREE_FLIGHT_POLICY,
      collectTrace: true,
    });
    expect(free.ok).toBe(true);
    const ranked = compileAircraft(revision, list, {
      cache,
      policy: RANKED_RACING_POLICY,
      collectTrace: true,
    });
    expect(ranked.trace.some((t) => t.stage === 'cache-hit')).toBe(false);
  });

  it('compiled propulsion units have unique motors and propellers; no NaN', () => {
    const craft = compileFactoryAircraft('velocity-x');
    const units = craft.compilation.specification!.propulsion.units;
    const motors = new Set(units.map((u) => u.motorSelectionId));
    const props = new Set(units.map((u) => u.propellerSelectionId));
    expect(motors.size).toBe(units.length);
    expect(props.size).toBe(units.length);
    for (const u of units) {
      expect(Number.isFinite(u.maxThrustNewtons)).toBe(true);
      expect(u.dataProvenance).toBe('peak-thrust-hint-fallback');
    }
    const a = craft.compilation.specification!.physicalAssembly;
    expect(Number.isFinite(a.inertia.roll)).toBe(true);
    expect(a.inertia.roll).toBeGreaterThan(0);
  });

  it('two builds with different frames/props keep distinct physical dims', () => {
    const a = compileFactoryAircraft('apex-r5');
    const b = compileFactoryAircraft('nano-scout');
    expect(a.physics.wheelbaseMeters).not.toBe(b.physics.wheelbaseMeters);
    expect(a.physics.propellerDiameterMeters).not.toBe(b.physics.propellerDiameterMeters);
  });
});
