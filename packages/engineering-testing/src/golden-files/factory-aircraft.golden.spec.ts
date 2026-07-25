import { describe, expect, it } from 'vitest';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileFactoryAircraft } from '@fpv/factory-aircraft';
import { FACTORY_GOLDEN_AIRCRAFT_IDS } from './factory-ids';
import {
  FREE_FLIGHT_POLICY,
  RANKED_RACING_POLICY,
} from '@fpv/compatibility-engine';
import { fingerprintCompilationContext } from '@fpv/aircraft-compiler';

export interface FactoryGoldenRow {
  readonly id: string;
  readonly buildFingerprint: string;
  readonly compilationContextFingerprint: string;
  readonly artifactFingerprint: string;
  readonly totalMassKg: number;
  readonly centerOfMass: { x: number; y: number; z: number };
  readonly inertiaKgM2: { roll: number; pitch: number; yaw: number };
  readonly maxThrustNewtons: number;
  readonly thrustToWeight: number;
  readonly runtimeRollInertia: number;
  readonly runtimeMaxRollRate: number;
  readonly rankedContextFingerprint: string;
}

const GOLDEN_PATH = resolve(
  __dirname,
  'factory-aircraft.golden.json',
);

function captureGoldens(): FactoryGoldenRow[] {
  const rankedCtx = fingerprintCompilationContext(RANKED_RACING_POLICY);
  return FACTORY_GOLDEN_AIRCRAFT_IDS.map((id) => {
    const craft = compileFactoryAircraft(id, { policy: FREE_FLIGHT_POLICY });
    const spec = craft.compilation.specification!;
    return {
      id,
      buildFingerprint: spec.buildFingerprint,
      compilationContextFingerprint: spec.compilationContextFingerprint,
      artifactFingerprint: spec.artifactFingerprint,
      totalMassKg: spec.physicalAssembly.totalMassKg,
      centerOfMass: { ...spec.physicalAssembly.centerOfMass },
      inertiaKgM2: {
        roll: spec.physicalAssembly.inertia.roll,
        pitch: spec.physicalAssembly.inertia.pitch,
        yaw: spec.physicalAssembly.inertia.yaw,
      },
      maxThrustNewtons: spec.propulsion.totalMaxThrustNewtons,
      thrustToWeight: spec.propulsion.thrustToWeight,
      runtimeRollInertia: spec.flightRuntime.rollInertia,
      runtimeMaxRollRate: spec.flightRuntime.maxRollRate,
      rankedContextFingerprint: rankedCtx,
    };
  });
}

describe('factory aircraft golden masters', () => {
  it('matches committed golden metrics (UPDATE_GOLDENS=1 to refresh)', () => {
    const current = captureGoldens();
    if (process.env['UPDATE_GOLDENS'] === '1') {
      writeFileSync(GOLDEN_PATH, JSON.stringify(current, null, 2) + '\n');
    }
    expect(existsSync(GOLDEN_PATH)).toBe(true);
    const committed = JSON.parse(
      readFileSync(GOLDEN_PATH, 'utf8'),
    ) as FactoryGoldenRow[];
    expect(current).toEqual(committed);

    const builds = new Set(current.map((r) => r.buildFingerprint));
    const artifacts = new Set(current.map((r) => r.artifactFingerprint));
    expect(builds.size).toBe(FACTORY_GOLDEN_AIRCRAFT_IDS.length);
    expect(artifacts.size).toBe(FACTORY_GOLDEN_AIRCRAFT_IDS.length);

    for (const row of current) {
      expect(row.compilationContextFingerprint).not.toBe(
        row.rankedContextFingerprint,
      );
      expect(row.totalMassKg).toBeGreaterThan(0);
      expect(row.inertiaKgM2.roll).toBeGreaterThan(0);
      expect(Number.isFinite(row.maxThrustNewtons)).toBe(true);
    }
  });
});
