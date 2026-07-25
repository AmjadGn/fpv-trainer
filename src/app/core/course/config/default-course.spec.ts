import { describe, expect, it } from 'vitest';

import { STARTER_CIRCUIT } from '../config/default-course';
import { ALPINE_TRAINING_VALLEY } from '../../environment/config/alpine-valley.config';
import { sampleTerrainHeight } from '../../environment/utils/terrain-generation';

describe('Starter Circuit alpine fit', () => {
  const sampleOptions = {
    settings: ALPINE_TRAINING_VALLEY.terrain,
    seed: ALPINE_TRAINING_VALLEY.seed,
    flattenZones: [
      {
        x: STARTER_CIRCUIT.startPosition.x,
        z: STARTER_CIRCUIT.startPosition.z,
        radius: ALPINE_TRAINING_VALLEY.terrain.flattenStartAreaRadius,
        targetHeight: 0,
      },
      ...STARTER_CIRCUIT.gates.map((g) => ({
        x: g.position.x,
        z: g.position.z,
        radius: ALPINE_TRAINING_VALLEY.terrain.flattenGateAreaRadius,
        targetHeight: 0,
      })),
    ],
    corridorRadius: ALPINE_TRAINING_VALLEY.worldSize * 0.12,
  };

  it('keeps a valid gate order and count', () => {
    expect(STARTER_CIRCUIT.gates.length).toBeGreaterThanOrEqual(8);
    expect(STARTER_CIRCUIT.gates.length).toBeLessThanOrEqual(10);
    STARTER_CIRCUIT.gates.forEach((g, i) => {
      expect(g.index).toBe(i);
    });
  });

  it('start pose is valid', () => {
    expect(STARTER_CIRCUIT.startPosition.y).toBeGreaterThan(0);
    expect(Number.isFinite(STARTER_CIRCUIT.startOrientation.w)).toBe(true);
  });

  it('every gate has terrain clearance near zero height', () => {
    for (const gate of STARTER_CIRCUIT.gates) {
      const h = sampleTerrainHeight(
        gate.position.x,
        gate.position.z,
        sampleOptions,
      );
      expect(Math.abs(h)).toBeLessThan(1.5);
      // Gate opening center stays above visual ground.
      expect(gate.position.y - gate.height * 0.5).toBeGreaterThan(0.2);
    }
  });

  it('minimap bounds include all gates and start', () => {
    const xs = [
      STARTER_CIRCUIT.startPosition.x,
      ...STARTER_CIRCUIT.gates.map((g) => g.position.x),
    ];
    const zs = [
      STARTER_CIRCUIT.startPosition.z,
      ...STARTER_CIRCUIT.gates.map((g) => g.position.z),
    ];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    expect(maxX - minX).toBeGreaterThan(10);
    expect(maxZ - minZ).toBeGreaterThan(40);
    for (const gate of STARTER_CIRCUIT.gates) {
      expect(gate.position.x).toBeGreaterThanOrEqual(minX);
      expect(gate.position.x).toBeLessThanOrEqual(maxX);
      expect(gate.position.z).toBeGreaterThanOrEqual(minZ);
      expect(gate.position.z).toBeLessThanOrEqual(maxZ);
    }
  });

  it('course stays inside the central valley corridor', () => {
    for (const gate of STARTER_CIRCUIT.gates) {
      expect(Math.abs(gate.position.x)).toBeLessThan(40);
      expect(Math.abs(gate.position.z)).toBeLessThan(130);
    }
  });
});
