import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  TrainingModuleDefinition,
  TrainingResult,
} from '../models/training-module.models';
import {
  TRAINING_PROGRESS_STORAGE_KEY,
  TrainingProgressService,
} from './training-progress.service';

function result(
  overrides: Partial<TrainingResult> = {},
): TrainingResult {
  return {
    moduleId: 'hover-control',
    moduleVersion: 1,
    completed: true,
    score: 80,
    medal: 'silver',
    durationMs: 30000,
    penalties: 0,
    metrics: { holdSeconds: 20 },
    completedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function gatedModule(): TrainingModuleDefinition {
  return {
    id: 'gated-module',
    version: 1,
    title: 'Gated',
    description: 'test',
    objective: 'test',
    difficulty: 'beginner',
    estimatedDurationSeconds: 60,
    environmentId: 'alpine-training-valley',
    spawnPose: {
      position: { x: 0, y: 1, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    },
    allowedRateProfiles: ['normal'],
    recommendedRateProfile: 'normal',
    evaluatorType: 'hover',
    evaluatorConfig: {},
    successCriteria: [],
    medalThresholds: { bronze: 50, silver: 70, gold: 88 },
    unlockRequirements: { requireModuleIds: ['hover-control'] },
    instructionalSteps: [],
    tips: [],
    supportsGhost: false,
    enabled: true,
  };
}

describe('TrainingProgressService', () => {
  let service: TrainingProgressService;
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
      configurable: true,
    });

    TestBed.configureTestingModule({
      providers: [TrainingProgressService],
    });
    service = TestBed.inject(TrainingProgressService);
  });

  afterEach(() => {
    storage.clear();
  });

  it('records module completion', () => {
    const record = service.recordCompletion(result());
    expect(record.completed).toBe(true);
    expect(record.highestMedal).toBe('silver');
    expect(record.bestScore).toBe(80);
    expect(service.getModuleProgress('hover-control')).toEqual(record);
  });

  it('upgrades medals', () => {
    service.recordCompletion(result({ medal: 'bronze', score: 55 }));
    const upgraded = service.recordCompletion(
      result({ medal: 'gold', score: 95 }),
    );
    expect(upgraded.highestMedal).toBe('gold');
    expect(upgraded.bestScore).toBe(95);
  });

  it('does not replace a higher medal with a lower one', () => {
    service.recordCompletion(result({ medal: 'gold', score: 95 }));
    const downgraded = service.recordCompletion(
      result({ medal: 'bronze', score: 60 }),
    );
    expect(downgraded.highestMedal).toBe('gold');
    expect(downgraded.bestScore).toBe(95);
  });

  it('increments attempts', () => {
    const first = service.recordAttempt('hover-control', 1);
    expect(first.attempts).toBe(1);
    const second = service.recordAttempt('hover-control', 1);
    expect(second.attempts).toBe(2);
  });

  it('persists progress across reload', () => {
    service.recordCompletion(result({ medal: 'silver', score: 80 }));
    expect(storage.get(TRAINING_PROGRESS_STORAGE_KEY)).toBeTruthy();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [TrainingProgressService],
    });
    const fresh = TestBed.inject(TrainingProgressService);
    expect(fresh.getModuleProgress('hover-control')?.highestMedal).toBe(
      'silver',
    );
  });

  it('falls back on corrupted data', () => {
    storage.set(TRAINING_PROGRESS_STORAGE_KEY, '{broken');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [TrainingProgressService],
    });
    const fresh = TestBed.inject(TrainingProgressService);
    expect(fresh.getProgress().modules).toEqual({});
    expect(fresh.getProgress().version).toBe(1);
  });

  it('reports unlock status from requirements', () => {
    const gated = gatedModule();
    expect(service.isUnlocked(gated)).toBe(false);
    service.recordCompletion(result({ moduleId: 'hover-control' }));
    expect(service.isUnlocked(gated)).toBe(true);
  });
});
