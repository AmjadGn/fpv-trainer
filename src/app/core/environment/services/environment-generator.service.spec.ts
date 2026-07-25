import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';

import { STARTER_CIRCUIT } from '../../course/config/default-course';
import { ALPINE_TRAINING_VALLEY } from '../config/alpine-valley.config';
import { EnvironmentGeneratorService } from './environment-generator.service';
import type { TrainerEnvironmentSettings } from '../../settings/models/trainer-settings.model';

describe('EnvironmentGeneratorService', () => {
  let service: EnvironmentGeneratorService;

  const settings: TrainerEnvironmentSettings = {
    selectedEnvironmentId: 'alpine-training-valley',
    quality: 'medium',
    timeOfDay: 'midday',
    vegetation: true,
    shadows: true,
    fog: true,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EnvironmentGeneratorService],
    });
    service = TestBed.inject(EnvironmentGeneratorService);
  });

  it('same definition produces matching placement data', () => {
    const a = service.generate({ course: STARTER_CIRCUIT, settings });
    const b = service.generate({ course: STARTER_CIRCUIT, settings });
    expect(a.seed).toBe(b.seed);
    expect(a.trees.length).toBe(b.trees.length);
    expect(a.rocks.length).toBe(b.rocks.length);
    if (a.trees.length > 0) {
      expect(a.trees[0]).toEqual(b.trees[0]);
    }
    expect(a.heights[100]).toBe(b.heights[100]);
  });

  it('vegetation respects course and spawn clearance', () => {
    const env = service.generate({ course: STARTER_CIRCUIT, settings });
    const spawn = STARTER_CIRCUIT.startPosition;
    const spawnClear = ALPINE_TRAINING_VALLEY.vegetation.minimumSpawnClearance;

    for (const tree of env.trees) {
      expect(
        Math.hypot(tree.x - spawn.x, tree.z - spawn.z),
      ).toBeGreaterThanOrEqual(spawnClear - 0.01);

      for (const gate of STARTER_CIRCUIT.gates) {
        const dist = Math.hypot(tree.x - gate.position.x, tree.z - gate.position.z);
        expect(dist).toBeGreaterThan(gate.width * 0.4);
      }
    }
  });

  it('generated positions are within world bounds', () => {
    const env = service.generate({ course: STARTER_CIRCUIT, settings });
    const half = env.worldSize * 0.5;
    for (const tree of env.trees) {
      expect(Math.abs(tree.x)).toBeLessThanOrEqual(half);
      expect(Math.abs(tree.z)).toBeLessThanOrEqual(half);
    }
  });

  it('invalid / fallback configuration falls back safely', () => {
    const env = service.generate({
      course: STARTER_CIRCUIT,
      settings,
      fallback: true,
    });
    expect(env.definitionId).toBe('fallback-flat');
    expect(env.trees.length).toBe(0);
    expect(env.heights.every((h) => h === 0)).toBe(true);
  });

  it('quality settings affect density/resolution predictably', () => {
    const low = service.generate({
      course: STARTER_CIRCUIT,
      settings: { ...settings, quality: 'low' },
    });
    const high = service.generate({
      course: STARTER_CIRCUIT,
      settings: { ...settings, quality: 'high' },
    });
    expect(low.segmentsX).toBeLessThan(high.segmentsX);
    expect(low.trees.length).toBeLessThan(high.trees.length);
  });

  it('vegetation off produces no plants', () => {
    const env = service.generate({
      course: STARTER_CIRCUIT,
      settings: { ...settings, vegetation: false },
    });
    expect(env.trees.length).toBe(0);
    expect(env.bushes.length).toBe(0);
    expect(env.grassPatches.length).toBe(0);
  });
});
