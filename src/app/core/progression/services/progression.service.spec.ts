import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  PLAYER_PROGRESS_STORAGE_KEY,
  XP_REWARDS,
  levelFromXp,
  xpForLevel,
} from '../models/player-progress.models';
import { ProgressionService } from './progression.service';

describe('ProgressionService', () => {
  let service: ProgressionService;
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
      providers: [ProgressionService],
    });
    service = TestBed.inject(ProgressionService);
  });

  afterEach(() => {
    storage.clear();
  });

  it('awards XP and follows the level formula', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(150);
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(100)).toBe(2);

    service.awardXp(100);
    expect(service.getProgress().experiencePoints).toBe(100);
    expect(service.getProgress().level).toBe(2);
    expect(service.getLevelInfo().xpIntoLevel).toBe(0);
  });

  it('records race completion and awards XP', () => {
    const before = service.getProgress().experiencePoints;
    service.recordRaceComplete('starter-circuit', {
      timeMs: 45000,
      clean: true,
    });
    const p = service.getProgress();
    expect(p.completedRaces).toBe(1);
    expect(p.bestTimes['starter-circuit']).toBe(45000);
    expect(p.experiencePoints).toBe(
      before + XP_REWARDS.raceComplete + XP_REWARDS.cleanRace,
    );

    service.recordRaceComplete('starter-circuit', { timeMs: 50000 });
    expect(service.getProgress().bestTimes['starter-circuit']).toBe(45000);
    expect(service.getProgress().completedRaces).toBe(2);
  });

  it('records training completion and syncs medal counts', () => {
    const before = service.getProgress().experiencePoints;
    service.recordTrainingCompletion({
      moduleId: 'hover-control',
      moduleVersion: 1,
      completed: true,
      score: 90,
      medal: 'gold',
      durationMs: 20000,
      penalties: 0,
      metrics: {},
      completedAt: '2026-01-01T00:00:00.000Z',
    });
    const p = service.getProgress();
    expect(p.completedTrainingModules).toContain('hover-control');
    expect(p.experiencePoints).toBe(
      before + XP_REWARDS.trainingComplete + XP_REWARDS.trainingGold,
    );

    service.syncMedalsFromTraining({ gold: 2, silver: 1, bronze: 3 });
    expect(service.getProgress().goldMedals).toBe(2);
    expect(service.getProgress().silverMedals).toBe(1);
    expect(service.getProgress().bronzeMedals).toBe(3);
  });

  it('persists progress and recovers from corrupt storage', () => {
    service.awardXp(50);
    expect(storage.get(PLAYER_PROGRESS_STORAGE_KEY)).toBeTruthy();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [ProgressionService],
    });
    const fresh = TestBed.inject(ProgressionService);
    expect(fresh.getProgress().experiencePoints).toBe(50);

    storage.set(PLAYER_PROGRESS_STORAGE_KEY, 'not-json');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [ProgressionService],
    });
    const recovered = TestBed.inject(ProgressionService);
    expect(recovered.getProgress().experiencePoints).toBe(0);
    expect(recovered.getProgress().level).toBe(1);
  });
});
