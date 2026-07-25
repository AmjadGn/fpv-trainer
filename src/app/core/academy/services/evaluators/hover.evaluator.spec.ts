import { describe, expect, it } from 'vitest';

import type { TrainingModuleDefinition } from '../../models/training-module.models';
import type { TrainingSessionSnapshot } from '../../models/training-session.models';
import { HoverEvaluator } from './hover.evaluator';

function hoverModule(
  overrides: Partial<TrainingModuleDefinition> = {},
): TrainingModuleDefinition {
  return {
    id: 'hover-control',
    version: 1,
    title: 'Hover Control',
    description: 'test',
    objective: 'test',
    difficulty: 'beginner',
    estimatedDurationSeconds: 90,
    environmentId: 'alpine-training-valley',
    spawnPose: {
      position: { x: 0, y: 1.2, z: -8 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    },
    allowedRateProfiles: ['normal'],
    recommendedRateProfile: 'normal',
    evaluatorType: 'hover',
    evaluatorConfig: {
      holdSeconds: 2,
      radius: 1.2,
      targetHeight: 3,
      center: { x: 0, y: 3, z: -12 },
      briefExitGraceSeconds: 1.5,
      crashPenalty: 15,
      verticalTolerance: 1,
    },
    successCriteria: [],
    medalThresholds: { bronze: 50, silver: 70, gold: 88 },
    unlockRequirements: {},
    instructionalSteps: [],
    tips: [],
    supportsGhost: false,
    enabled: true,
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<TrainingSessionSnapshot> = {},
): TrainingSessionSnapshot {
  return {
    position: { x: 0, y: 3, z: -12 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    velocity: { x: 0, y: 0, z: 0 },
    speed: 0,
    altitude: 3,
    armed: true,
    crashed: false,
    throttle: 0.5,
    elapsedMs: 0,
    deltaSeconds: 0.1,
    ...overrides,
  };
}

describe('HoverEvaluator', () => {
  it('accumulates hold progress inside the zone', () => {
    const evaluator = new HoverEvaluator();
    evaluator.start({ module: hoverModule() });
    for (let i = 0; i < 5; i++) {
      evaluator.update(snapshot({ elapsedMs: i * 100, deltaSeconds: 0.1 }));
    }
    const partial = evaluator.finish();
    expect(partial.completed).toBe(false);
    expect(partial.metrics['holdSeconds']).toBeCloseTo(0.5, 5);
  });

  it('reduces progress when leaving the zone', () => {
    const evaluator = new HoverEvaluator();
    evaluator.start({ module: hoverModule() });
    for (let i = 0; i < 10; i++) {
      evaluator.update(snapshot({ elapsedMs: i * 100, deltaSeconds: 0.1 }));
    }
    const before = evaluator.finish().metrics['holdSeconds'];
    for (let i = 0; i < 10; i++) {
      evaluator.update(
        snapshot({
          position: { x: 5, y: 3, z: -12 },
          altitude: 3,
          elapsedMs: 1000 + i * 100,
          deltaSeconds: 0.1,
        }),
      );
    }
    const after = evaluator.finish().metrics['holdSeconds'];
    expect(after).toBeLessThan(before);
  });

  it('succeeds after enough hold time', () => {
    const evaluator = new HoverEvaluator();
    evaluator.start({ module: hoverModule() });
    for (let i = 0; i < 25; i++) {
      evaluator.update(snapshot({ elapsedMs: i * 100, deltaSeconds: 0.1 }));
    }
    expect(evaluator.isTerminal()).toBe(true);
    const result = evaluator.finish();
    expect(result.completed).toBe(true);
    expect(result.metrics['holdSeconds']).toBe(2);
  });

  it('applies crash penalty and resets hold', () => {
    const evaluator = new HoverEvaluator();
    evaluator.start({ module: hoverModule() });
    for (let i = 0; i < 10; i++) {
      evaluator.update(snapshot({ elapsedMs: i * 100, deltaSeconds: 0.1 }));
    }
    evaluator.update(snapshot({ crashed: true, deltaSeconds: 0.1 }));
    const result = evaluator.finish();
    expect(result.metrics['holdSeconds']).toBe(0);
    expect(result.penalties.some((p) => p.id === 'crash')).toBe(true);
    expect(result.penalties[0]?.amount).toBe(15);
  });

  it('produces finite scoring', () => {
    const evaluator = new HoverEvaluator();
    evaluator.start({ module: hoverModule() });
    for (let i = 0; i < 25; i++) {
      evaluator.update(snapshot({ elapsedMs: i * 100, deltaSeconds: 0.1 }));
    }
    const result = evaluator.finish();
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.medal).not.toBe('none');
  });
});
