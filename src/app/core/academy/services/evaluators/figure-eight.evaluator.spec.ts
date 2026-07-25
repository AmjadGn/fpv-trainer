import { describe, expect, it } from 'vitest';

import type { TrainingModuleDefinition } from '../../models/training-module.models';
import type { TrainingSessionSnapshot } from '../../models/training-session.models';
import { FigureEightEvaluator } from './figure-eight.evaluator';

const CENTER = { x: 0, y: 2, z: -30 };
const LEFT = { x: -8, y: 2, z: -30 };
const RIGHT = { x: 8, y: 2, z: -30 };

function figureEightModule(
  requiredCycles = 2,
): TrainingModuleDefinition {
  return {
    id: 'figure-eight',
    version: 1,
    title: 'Figure Eight',
    description: 'test',
    objective: 'test',
    difficulty: 'intermediate',
    estimatedDurationSeconds: 150,
    environmentId: 'alpine-training-valley',
    spawnPose: {
      position: { x: 0, y: 2, z: -22 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    },
    allowedRateProfiles: ['normal'],
    recommendedRateProfile: 'normal',
    evaluatorType: 'figureEight',
    evaluatorConfig: {
      center: CENTER,
      leftMarker: LEFT,
      rightMarker: RIGHT,
      checkpointRadius: 3,
      requiredCycles,
    },
    successCriteria: [],
    medalThresholds: { bronze: 55, silver: 72, gold: 90 },
    unlockRequirements: {},
    instructionalSteps: [],
    tips: [],
    supportsGhost: false,
    enabled: true,
  };
}

function snapshot(
  position: { x: number; y: number; z: number },
  overrides: Partial<TrainingSessionSnapshot> = {},
): TrainingSessionSnapshot {
  return {
    position,
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    velocity: { x: 1, y: 0, z: 0 },
    speed: 4,
    altitude: position.y,
    armed: true,
    crashed: false,
    throttle: 0.5,
    elapsedMs: 0,
    deltaSeconds: 0.1,
    ...overrides,
  };
}

/** Leave checkpoint radius so the next enter edge-triggers. */
function leave(evaluator: FigureEightEvaluator, elapsedMs: number): void {
  evaluator.update(
    snapshot({ x: 0, y: 2, z: 0 }, { elapsedMs, speed: 4 }),
  );
}

function hit(
  evaluator: FigureEightEvaluator,
  position: { x: number; y: number; z: number },
  elapsedMs: number,
): void {
  leave(evaluator, elapsedMs - 50);
  evaluator.update(snapshot(position, { elapsedMs, speed: 4 }));
}

describe('FigureEightEvaluator', () => {
  it('completes center-left-center-right sequence', () => {
    const evaluator = new FigureEightEvaluator();
    evaluator.start({ module: figureEightModule(1) });
    hit(evaluator, CENTER, 100);
    hit(evaluator, LEFT, 200);
    hit(evaluator, CENTER, 300);
    hit(evaluator, RIGHT, 400);
    expect(evaluator.isTerminal()).toBe(true);
    const result = evaluator.finish();
    expect(result.completed).toBe(true);
    expect(result.metrics['cyclesCompleted']).toBe(1);
  });

  it('soft-recovers from wrong sequence without advancing', () => {
    const evaluator = new FigureEightEvaluator();
    evaluator.start({ module: figureEightModule(1) });
    hit(evaluator, CENTER, 100);
    // Expected left; hit right instead.
    hit(evaluator, RIGHT, 200);
    const mid = evaluator.finish();
    expect(mid.metrics['wrongOrderCount']).toBe(1);
    expect(mid.metrics['cyclesCompleted']).toBe(0);
    // Still expecting left — correct sequence continues.
    hit(evaluator, LEFT, 300);
    hit(evaluator, CENTER, 400);
    hit(evaluator, RIGHT, 500);
    expect(evaluator.isTerminal()).toBe(true);
    expect(evaluator.finish().completed).toBe(true);
  });

  it('requires configured cycles for success', () => {
    const evaluator = new FigureEightEvaluator();
    evaluator.start({ module: figureEightModule(2) });
    hit(evaluator, CENTER, 100);
    hit(evaluator, LEFT, 200);
    hit(evaluator, CENTER, 300);
    hit(evaluator, RIGHT, 400);
    expect(evaluator.isTerminal()).toBe(false);
    hit(evaluator, CENTER, 500);
    hit(evaluator, LEFT, 600);
    hit(evaluator, CENTER, 700);
    hit(evaluator, RIGHT, 800);
    expect(evaluator.isTerminal()).toBe(true);
    expect(evaluator.finish().metrics['cyclesCompleted']).toBe(2);
  });

  it('produces finite scoring', () => {
    const evaluator = new FigureEightEvaluator();
    evaluator.start({ module: figureEightModule(1) });
    hit(evaluator, CENTER, 100);
    hit(evaluator, LEFT, 200);
    hit(evaluator, CENTER, 300);
    hit(evaluator, RIGHT, 400);
    const result = evaluator.finish();
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.medal).not.toBe('none');
  });
});
