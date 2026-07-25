import { describe, expect, it } from 'vitest';

import { ALPINE_TRAINING_VALLEY } from '../config/alpine-valley.config';
import { STARTER_CIRCUIT } from '../../course/config/default-course';
import {
  buildTerrainGrid,
  sampleTerrainHeight,
  terrainHeightAt,
  terrainVertexColor,
  type FlattenZone,
} from './terrain-generation';

describe('terrain generation', () => {
  const baseOptions = {
    settings: { ...ALPINE_TRAINING_VALLEY.terrain, segmentsX: 48, segmentsZ: 48 },
    seed: ALPINE_TRAINING_VALLEY.seed,
    flattenZones: [
      {
        x: STARTER_CIRCUIT.startPosition.x,
        z: STARTER_CIRCUIT.startPosition.z,
        radius: ALPINE_TRAINING_VALLEY.terrain.flattenStartAreaRadius,
        targetHeight: 0,
      },
      ...STARTER_CIRCUIT.gates.map(
        (g): FlattenZone => ({
          x: g.position.x,
          z: g.position.z,
          radius: ALPINE_TRAINING_VALLEY.terrain.flattenGateAreaRadius,
          targetHeight: 0,
        }),
      ),
    ],
    corridorRadius: ALPINE_TRAINING_VALLEY.worldSize * 0.12,
  };

  it('same seed produces identical sampled heights', () => {
    const a = sampleTerrainHeight(12, -40, baseOptions);
    const b = sampleTerrainHeight(12, -40, baseOptions);
    expect(a).toBe(b);
  });

  it('center valley is lower than outer mountain region', () => {
    const center = sampleTerrainHeight(0, 0, {
      ...baseOptions,
      flattenZones: [],
      corridorRadius: 1,
    });
    const edge = sampleTerrainHeight(360, 360, {
      ...baseOptions,
      flattenZones: [],
      corridorRadius: 1,
    });
    expect(edge).toBeGreaterThan(center + 15);
  });

  it('spawn area is flattened near zero', () => {
    const h = sampleTerrainHeight(
      STARTER_CIRCUIT.startPosition.x,
      STARTER_CIRCUIT.startPosition.z,
      baseOptions,
    );
    expect(Math.abs(h)).toBeLessThan(1.2);
  });

  it('gate clearance areas are safe / near zero', () => {
    for (const gate of STARTER_CIRCUIT.gates) {
      const h = sampleTerrainHeight(gate.position.x, gate.position.z, baseOptions);
      expect(Math.abs(h)).toBeLessThan(1.5);
    }
  });

  it('terrain height values are finite', () => {
    const grid = buildTerrainGrid(baseOptions, 32, 32);
    for (let i = 0; i < grid.heights.length; i++) {
      expect(Number.isFinite(grid.heights[i])).toBe(true);
    }
  });

  it('terrain vertex color selection is deterministic', () => {
    const a = terrainVertexColor({ height: 5, slope: 0.2, noise: 0.4 });
    const b = terrainVertexColor({ height: 5, slope: 0.2, noise: 0.4 });
    expect(a).toEqual(b);
    const peak = terrainVertexColor({ height: 50, slope: 0.1, noise: 0.5 });
    expect(peak[0]).toBeGreaterThan(0.6);
  });

  it('terrainHeightAt interpolates the built grid', () => {
    const grid = buildTerrainGrid(baseOptions, 32, 32);
    const h = terrainHeightAt(0, 0, grid);
    expect(Number.isFinite(h)).toBe(true);
    const corner = terrainHeightAt(300, 300, grid);
    expect(corner).toBeGreaterThan(h);
  });
});
