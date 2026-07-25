import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';

import { STARTER_CIRCUIT } from '../../course/config/default-course';
import { ALPINE_TRAINING_VALLEY } from '../config/alpine-valley.config';
import { COASTAL_RUINS } from '../config/coastal-ruins.config';
import { DESERT_INDUSTRIAL_YARD } from '../config/desert-industrial.config';
import { EnvironmentGeneratorService } from '../services/environment-generator.service';
import type { TrainerEnvironmentSettings } from '../../settings/models/trainer-settings.model';
import {
  buildEnvironmentColliderManifest,
  filterCollidersForQuality,
} from './environment-collider-builder.service';
import { EnvironmentColliderBuilderService } from './collider-manifest.model';

describe('environment collider builder', () => {
  let generator: EnvironmentGeneratorService;
  let builder: EnvironmentColliderBuilderService;

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
      providers: [EnvironmentGeneratorService, EnvironmentColliderBuilderService],
    });
    generator = TestBed.inject(EnvironmentGeneratorService);
    builder = TestBed.inject(EnvironmentColliderBuilderService);
  });

  function envFor(definition: typeof ALPINE_TRAINING_VALLEY) {
    return generator.generate({
      definition,
      course: STARTER_CIRCUIT,
      settings,
    });
  }

  it('alpine manifest includes critical structures (legacy ground, no Rapier terrain)', () => {
    const env = envFor(ALPINE_TRAINING_VALLEY);
    const manifest = buildEnvironmentColliderManifest(env, {
      course: STARTER_CIRCUIT,
    });
    const ids = manifest.colliders.map((c) => c.id);

    expect(ids).not.toContain('terrain-ground');
    expect(ids).not.toContain('terrain-heightfield');
    expect(manifest.colliders.some((c) => c.objectId === 'cabin')).toBe(true);
    expect(manifest.colliders.some((c) => c.objectId === 'tree')).toBe(true);
    expect(manifest.colliders.some((c) => c.objectId === 'barrier')).toBe(true);
    expect(manifest.colliders.some((c) => c.objectId === 'gateFrame')).toBe(
      true,
    );
    expect(manifest.colliders.some((c) => c.id.startsWith('gate-0-'))).toBe(
      true,
    );
    expect(manifest.colliders.some((c) => c.collisionCritical)).toBe(true);
  });

  it('gate frame leaves center opening free of a solid fill box', () => {
    const frames = buildEnvironmentColliderManifest(envFor(ALPINE_TRAINING_VALLEY), {
      course: STARTER_CIRCUIT,
    }).colliders.filter((c) => c.objectId === 'gateFrame');
    // Compound posts/bars only — never one solid blocking cuboid for the whole gate.
    expect(frames.length).toBeGreaterThanOrEqual(4);
    expect(frames.every((c) => c.shape.kind === 'box')).toBe(true);
  });

  it('desert manifest includes industrial structures', () => {
    const env = envFor(DESERT_INDUSTRIAL_YARD);
    const manifest = buildEnvironmentColliderManifest(env);

    expect(manifest.colliders.some((c) => c.id === 'terrain-ground')).toBe(
      false,
    );
    expect(manifest.colliders.some((c) => c.objectId === 'container')).toBe(
      true,
    );
    expect(manifest.colliders.some((c) => c.objectId === 'crane')).toBe(true);
  });

  it('coastal manifest includes ruin structures and water sensor', () => {
    const env = envFor(COASTAL_RUINS);
    const manifest = buildEnvironmentColliderManifest(env);

    expect(manifest.colliders.some((c) => c.id === 'terrain-ground')).toBe(
      false,
    );
    expect(manifest.colliders.some((c) => c.objectId === 'ruinWall')).toBe(
      true,
    );
    expect(manifest.colliders.some((c) => c.id === 'ocean-water-sensor')).toBe(
      true,
    );
  });

  it('competitive mode strips dynamic props', () => {
    const env = envFor(ALPINE_TRAINING_VALLEY);
    const competitive = builder.build(env, {
      competitive: true,
      quality: 'high',
    });
    const freeFlight = builder.build(env, {
      competitive: false,
      quality: 'high',
    });

    const competitiveDynamic = competitive.colliders.filter(
      (c) => c.bodyType === 'dynamic',
    ).length;
    const freeDynamic = freeFlight.colliders.filter(
      (c) => c.bodyType === 'dynamic',
    ).length;

    expect(competitiveDynamic).toBe(0);
    expect(freeDynamic).toBeGreaterThan(0);
  });

  it('quality filter keeps collision-critical colliders', () => {
    const env = envFor(ALPINE_TRAINING_VALLEY);
    const raw = buildEnvironmentColliderManifest(env, { allowDynamicProps: true });
    const criticalIds = raw.colliders
      .filter((c) => c.collisionCritical)
      .map((c) => c.id);
    const low = filterCollidersForQuality(raw.colliders, 'low');

    for (const id of criticalIds) {
      expect(low.some((c) => c.id === id)).toBe(true);
    }
  });
});
