import { describe, expect, it } from 'vitest';

import type { TrainingModuleDefinition } from '../../models/training-module.models';
import type { TrainingSessionSnapshot } from '../../models/training-session.models';
import { GateCourseEvaluator } from './gate-course.evaluator';

function gateModule(): TrainingModuleDefinition {
  return {
    id: 'gate-basics',
    version: 1,
    title: 'Gate Basics',
    description: 'test',
    objective: 'test',
    difficulty: 'beginner',
    estimatedDurationSeconds: 120,
    environmentId: 'alpine-training-valley',
    spawnPose: {
      position: { x: 0, y: 1.2, z: 4 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    },
    allowedRateProfiles: ['normal'],
    recommendedRateProfile: 'normal',
    evaluatorType: 'gateCourse',
    evaluatorConfig: { gateCount: 4 },
    successCriteria: [],
    medalThresholds: { bronze: 50, silver: 70, gold: 88 },
    unlockRequirements: {},
    instructionalSteps: [],
    tips: [],
    supportsGhost: true,
    enabled: true,
  };
}

function snapshot(
  overrides: Partial<TrainingSessionSnapshot> = {},
): TrainingSessionSnapshot {
  return {
    position: { x: 0, y: 2, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    velocity: { x: 0, y: 0, z: -5 },
    speed: 5,
    altitude: 2,
    armed: true,
    crashed: false,
    throttle: 0.6,
    elapsedMs: 0,
    deltaSeconds: 0.1,
    ...overrides,
  };
}

describe('GateCourseEvaluator', () => {
  it('completes on the correct gate sequence', () => {
    const evaluator = new GateCourseEvaluator();
    evaluator.start({ module: gateModule() });
    for (let gate = 0; gate < 4; gate++) {
      evaluator.update(snapshot({ elapsedMs: (gate + 1) * 1000 }));
      evaluator.handleEvent({
        type: 'gate',
        payload: { gateIndex: gate, centerAccuracy: 0.9 },
      });
    }
    evaluator.handleEvent({ type: 'finish' });
    expect(evaluator.isTerminal()).toBe(true);
    const result = evaluator.finish();
    expect(result.completed).toBe(true);
    expect(result.metrics['gatesPassed']).toBe(4);
  });

  it('handles skipped / out-of-order gates', () => {
    const evaluator = new GateCourseEvaluator();
    evaluator.start({ module: gateModule() });
    evaluator.handleEvent({
      type: 'gate',
      payload: { gateIndex: 2 },
    });
    const mid = evaluator.finish();
    expect(mid.completed).toBe(false);
    expect(mid.metrics['gatesPassed']).toBe(0);
    expect(mid.penalties.some((p) => p.label === 'Out of sequence')).toBe(
      true,
    );
  });

  it('finishes with penalties applied to score', () => {
    const evaluator = new GateCourseEvaluator();
    evaluator.start({ module: gateModule() });
    evaluator.handleEvent({ type: 'miss' });
    evaluator.handleEvent({ type: 'crash' });
    for (let gate = 0; gate < 4; gate++) {
      evaluator.update(snapshot({ elapsedMs: (gate + 1) * 800 }));
      evaluator.handleEvent({
        type: 'gate',
        payload: { gateIndex: gate, centerAccuracy: 0.8 },
      });
    }
    evaluator.handleEvent({ type: 'finish' });
    const result = evaluator.finish();
    expect(result.completed).toBe(true);
    expect(result.penalties.length).toBeGreaterThanOrEqual(2);
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeLessThan(100);
  });
});
