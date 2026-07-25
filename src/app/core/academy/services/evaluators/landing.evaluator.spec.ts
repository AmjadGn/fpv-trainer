import { describe, expect, it } from 'vitest';

import type { TrainingModuleDefinition } from '../../models/training-module.models';
import type { TrainingSessionSnapshot } from '../../models/training-session.models';
import { LandingEvaluator } from './landing.evaluator';

function landingModule(): TrainingModuleDefinition {
  return {
    id: 'precision-landing',
    version: 1,
    title: 'Precision Landing',
    description: 'test',
    objective: 'test',
    difficulty: 'beginner',
    estimatedDurationSeconds: 60,
    environmentId: 'alpine-training-valley',
    spawnPose: {
      position: { x: 0, y: 4, z: -8 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    },
    allowedRateProfiles: ['normal'],
    recommendedRateProfile: 'normal',
    evaluatorType: 'landing',
    evaluatorConfig: {
      padCenter: { x: 8, y: 0, z: -20 },
      padRadius: 1.5,
      maxVerticalSpeed: 1.2,
      maxImpactSpeed: 2.5,
      maxTiltRadians: 0.45,
      confirmSeconds: 0.6,
      crashFails: true,
    },
    successCriteria: [],
    medalThresholds: { bronze: 55, silver: 75, gold: 90 },
    unlockRequirements: {},
    instructionalSteps: [],
    tips: [],
    supportsGhost: false,
    enabled: true,
  };
}

function snapshot(
  overrides: Partial<TrainingSessionSnapshot> = {},
): TrainingSessionSnapshot {
  return {
    position: { x: 8, y: 0.05, z: -20 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    velocity: { x: 0, y: -0.2, z: 0 },
    speed: 0.2,
    altitude: 0.05,
    armed: true,
    crashed: false,
    throttle: 0.1,
    elapsedMs: 2000,
    deltaSeconds: 0.1,
    ...overrides,
  };
}

/** ~90° pitch — body up far from world up. */
function tiltedQuat(): { x: number; y: number; z: number; w: number } {
  const half = Math.PI / 4;
  return { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) };
}

describe('LandingEvaluator', () => {
  it('succeeds on a soft landing inside the pad', () => {
    const evaluator = new LandingEvaluator();
    evaluator.start({ module: landingModule() });
    for (let i = 0; i < 10; i++) {
      evaluator.update(snapshot({ elapsedMs: 2000 + i * 100 }));
    }
    expect(evaluator.isTerminal()).toBe(true);
    const result = evaluator.finish();
    expect(result.completed).toBe(true);
    expect(result.medal).not.toBe('none');
  });

  it('fails outside the pad', () => {
    const evaluator = new LandingEvaluator();
    evaluator.start({ module: landingModule() });
    evaluator.update(
      snapshot({
        position: { x: 20, y: 0.05, z: -20 },
      }),
    );
    expect(evaluator.isTerminal()).toBe(true);
    const result = evaluator.finish();
    expect(result.completed).toBe(false);
    expect(result.penalties.some((p) => p.id === 'outside-pad')).toBe(true);
  });

  it('fails on hard vertical landing', () => {
    const evaluator = new LandingEvaluator();
    evaluator.start({ module: landingModule() });
    evaluator.update(
      snapshot({
        velocity: { x: 0, y: -2, z: 0 },
        speed: 2,
      }),
    );
    expect(evaluator.isTerminal()).toBe(true);
    const result = evaluator.finish();
    expect(result.completed).toBe(false);
    expect(result.penalties.some((p) => p.id === 'hard-vertical')).toBe(true);
  });

  it('fails on excessive tilt', () => {
    const evaluator = new LandingEvaluator();
    evaluator.start({ module: landingModule() });
    evaluator.update(snapshot({ orientation: tiltedQuat() }));
    expect(evaluator.isTerminal()).toBe(true);
    const result = evaluator.finish();
    expect(result.completed).toBe(false);
    expect(result.penalties.some((p) => p.id === 'tilt')).toBe(true);
  });

  it('produces finite scoring', () => {
    const evaluator = new LandingEvaluator();
    evaluator.start({ module: landingModule() });
    for (let i = 0; i < 10; i++) {
      evaluator.update(snapshot({ elapsedMs: 2000 + i * 100 }));
    }
    const result = evaluator.finish();
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
