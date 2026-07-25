import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ACHIEVEMENTS_STORAGE_KEY } from '../models/achievement.models';
import { AchievementService } from './achievement.service';
import { ProgressionService } from './progression.service';

describe('AchievementService', () => {
  let achievements: AchievementService;
  let progression: ProgressionService;
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
      providers: [AchievementService, ProgressionService],
    });
    achievements = TestBed.inject(AchievementService);
    progression = TestBed.inject(ProgressionService);
  });

  afterEach(() => {
    storage.clear();
  });

  it('unlocks an achievement once and awards XP once', () => {
    const xpBefore = progression.getProgress().experiencePoints;
    const first = achievements.handleEvent({ type: 'takeoff' });
    expect(first.some((u) => u.id === 'first-takeoff')).toBe(true);
    expect(achievements.isUnlocked('first-takeoff')).toBe(true);

    const xpAfter = progression.getProgress().experiencePoints;
    expect(xpAfter).toBe(xpBefore + 25);

    const second = achievements.handleEvent({ type: 'takeoff' });
    expect(second).toEqual([]);
    expect(progression.getProgress().experiencePoints).toBe(xpAfter);
  });

  it('ignores duplicate unlock events', () => {
    achievements.handleEvent({ type: 'ghost_beaten' });
    const pending = achievements.consumePendingUnlocks();
    expect(pending.some((u) => u.id === 'ghost-hunter')).toBe(true);

    achievements.handleEvent({ type: 'ghost_beaten' });
    expect(achievements.consumePendingUnlocks()).toEqual([]);
  });

  it('persists unlocks across reload', () => {
    achievements.handleEvent({ type: 'takeoff' });
    expect(storage.get(ACHIEVEMENTS_STORAGE_KEY)).toBeTruthy();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [AchievementService, ProgressionService],
    });
    const fresh = TestBed.inject(AchievementService);
    expect(fresh.isUnlocked('first-takeoff')).toBe(true);
  });

  it('handles takeoff, gate, race finish, and module events', () => {
    expect(
      achievements.handleEvent({ type: 'takeoff' }).map((u) => u.id),
    ).toContain('first-takeoff');

    progression.recordGate();
    expect(
      achievements.handleEvent({ type: 'gate' }).map((u) => u.id),
    ).toContain('first-gate');

    progression.recordRaceComplete('starter-circuit', {
      timeMs: 40000,
      clean: true,
    });
    const raceUnlocks = achievements.handleEvent({
      type: 'race_finish',
      courseId: 'starter-circuit',
      clean: true,
    });
    expect(raceUnlocks.map((u) => u.id)).toEqual(
      expect.arrayContaining(['first-finish', 'clean-run']),
    );

    const moduleUnlocks = achievements.handleEvent({
      type: 'module_complete',
      moduleId: 'hover-control',
      medal: 'silver',
    });
    expect(moduleUnlocks.map((u) => u.id)).toContain('hover-student');
  });
});
