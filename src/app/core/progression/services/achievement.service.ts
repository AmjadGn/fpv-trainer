import { Injectable, inject, signal } from '@angular/core';

import { ACHIEVEMENTS } from '../config/achievements.config';
import type {
  AchievementDefinition,
  AchievementsStore,
  UnlockedAchievement,
} from '../models/achievement.models';
import {
  ACHIEVEMENTS_STORAGE_KEY,
  ACHIEVEMENTS_VERSION,
} from '../models/achievement.models';
import { ProgressionService } from './progression.service';

export type ProgressionEvent =
  | { type: 'takeoff' }
  | { type: 'gate' }
  | { type: 'race_finish'; courseId: string; clean: boolean }
  | { type: 'ghost_beaten' }
  | { type: 'module_complete'; moduleId: string; medal: string }
  | { type: 'best_improved'; courseId: string; improvedPct: number }
  | { type: 'flight_time'; totalMs: number }
  | { type: 'clean_finish'; courseId?: string };

/**
 * Evaluates achievement conditions once, awards XP, and queues unlock toasts.
 */
@Injectable({ providedIn: 'root' })
export class AchievementService {
  private readonly progression = inject(ProgressionService);

  private readonly unlockedSignal = signal<UnlockedAchievement[]>(
    this.loadUnlocked(),
  );
  private readonly pendingSignal = signal<UnlockedAchievement[]>([]);

  readonly unlocked = this.unlockedSignal.asReadonly();
  readonly pendingUnlocks = this.pendingSignal.asReadonly();

  getUnlocked(): UnlockedAchievement[] {
    return this.unlockedSignal();
  }

  isUnlocked(achievementId: string): boolean {
    return this.unlockedSignal().some((u) => u.id === achievementId);
  }

  /** Drain newly unlocked achievements for UI toasts. */
  consumePendingUnlocks(): UnlockedAchievement[] {
    const pending = this.pendingSignal();
    this.pendingSignal.set([]);
    return pending;
  }

  handleEvent(event: ProgressionEvent): UnlockedAchievement[] {
    const newly: UnlockedAchievement[] = [];
    for (const def of ACHIEVEMENTS) {
      if (this.isUnlocked(def.id)) {
        continue;
      }
      if (this.matches(def, event)) {
        const unlocked = this.unlock(def);
        if (unlocked) {
          newly.push(unlocked);
        }
      }
    }
    return newly;
  }

  /** Re-check threshold achievements against current progression stats. */
  evaluateProgressSnapshot(): UnlockedAchievement[] {
    const newly: UnlockedAchievement[] = [];
    for (const def of ACHIEVEMENTS) {
      if (this.isUnlocked(def.id)) {
        continue;
      }
      if (this.matchesProgress(def)) {
        const unlocked = this.unlock(def);
        if (unlocked) {
          newly.push(unlocked);
        }
      }
    }
    return newly;
  }

  private matches(
    def: AchievementDefinition,
    event: ProgressionEvent,
  ): boolean {
    const cfg = def.conditionConfig;
    switch (def.conditionType) {
      case 'takeoff':
        return event.type === 'takeoff';
      case 'gates_completed': {
        if (event.type === 'gate') {
          const min =
            typeof cfg['min'] === 'number' && Number.isFinite(cfg['min'])
              ? cfg['min']
              : 1;
          return this.progression.getProgress().gatesCompleted >= min;
        }
        return false;
      }
      case 'races_completed': {
        if (event.type === 'race_finish') {
          const min =
            typeof cfg['min'] === 'number' && Number.isFinite(cfg['min'])
              ? cfg['min']
              : 1;
          return this.progression.getProgress().completedRaces >= min;
        }
        return false;
      }
      case 'event': {
        const eventType = cfg['eventType'];
        if (eventType === 'race_finish' && event.type === 'race_finish') {
          const courseId = cfg['courseId'];
          if (typeof courseId === 'string' && courseId.length > 0) {
            return event.courseId === courseId;
          }
          return true;
        }
        if (eventType === 'clean_finish') {
          return (
            (event.type === 'race_finish' && event.clean) ||
            event.type === 'clean_finish'
          );
        }
        if (eventType === 'ghost_beaten') {
          return event.type === 'ghost_beaten';
        }
        return false;
      }
      case 'module_completed':
        return (
          event.type === 'module_complete' &&
          event.moduleId === cfg['moduleId']
        );
      case 'module_medal':
        return (
          event.type === 'module_complete' &&
          event.moduleId === cfg['moduleId'] &&
          event.medal === cfg['medal']
        );
      case 'flight_time_ms': {
        if (event.type !== 'flight_time') {
          return false;
        }
        const minMs =
          typeof cfg['minMs'] === 'number' && Number.isFinite(cfg['minMs'])
            ? cfg['minMs']
            : 600_000;
        return event.totalMs >= minMs;
      }
      case 'best_improved_pct': {
        if (event.type !== 'best_improved') {
          return false;
        }
        const minPct =
          typeof cfg['minPct'] === 'number' && Number.isFinite(cfg['minPct'])
            ? cfg['minPct']
            : 5;
        return event.improvedPct >= minPct;
      }
      default:
        return false;
    }
  }

  private matchesProgress(def: AchievementDefinition): boolean {
    const p = this.progression.getProgress();
    const cfg = def.conditionConfig;
    switch (def.conditionType) {
      case 'gates_completed': {
        const min =
          typeof cfg['min'] === 'number' && Number.isFinite(cfg['min'])
            ? cfg['min']
            : 1;
        return p.gatesCompleted >= min;
      }
      case 'races_completed': {
        const min =
          typeof cfg['min'] === 'number' && Number.isFinite(cfg['min'])
            ? cfg['min']
            : 1;
        return p.completedRaces >= min;
      }
      case 'flight_time_ms': {
        const minMs =
          typeof cfg['minMs'] === 'number' && Number.isFinite(cfg['minMs'])
            ? cfg['minMs']
            : 600_000;
        return p.totalFlightTimeMs >= minMs;
      }
      case 'module_completed': {
        const moduleId = cfg['moduleId'];
        return (
          typeof moduleId === 'string' &&
          p.completedTrainingModules.includes(moduleId)
        );
      }
      default:
        return false;
    }
  }

  private unlock(def: AchievementDefinition): UnlockedAchievement | null {
    if (this.isUnlocked(def.id)) {
      return null;
    }
    const xp =
      typeof def.xpReward === 'number' && Number.isFinite(def.xpReward)
        ? Math.max(0, Math.floor(def.xpReward))
        : 0;
    const record: UnlockedAchievement = {
      id: def.id,
      unlockedAt: new Date().toISOString(),
      xpAwarded: xp,
    };
    const next = [...this.unlockedSignal(), record];
    this.unlockedSignal.set(next);
    this.pendingSignal.update((q) => [...q, record]);
    this.persist(next);
    this.progression.markAchievementUnlocked(def.id);
    if (xp > 0) {
      this.progression.awardXp(xp);
    }
    return record;
  }

  private loadUnlocked(): UnlockedAchievement[] {
    try {
      const raw = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed: unknown = JSON.parse(raw);
      return this.migrate(parsed);
    } catch {
      return [];
    }
  }

  private migrate(raw: unknown): UnlockedAchievement[] {
    if (!raw || typeof raw !== 'object') {
      return [];
    }
    const obj = raw as Record<string, unknown>;
    const version =
      typeof obj['version'] === 'number' && Number.isFinite(obj['version'])
        ? obj['version']
        : 0;
    if (version > ACHIEVEMENTS_VERSION) {
      return [];
    }
    const list = Array.isArray(obj['unlocked']) ? obj['unlocked'] : [];
    const unlocked: UnlockedAchievement[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const u = item as Record<string, unknown>;
      if (typeof u['id'] !== 'string') {
        continue;
      }
      unlocked.push({
        id: u['id'],
        unlockedAt:
          typeof u['unlockedAt'] === 'string'
            ? u['unlockedAt']
            : new Date(0).toISOString(),
        xpAwarded:
          typeof u['xpAwarded'] === 'number' && Number.isFinite(u['xpAwarded'])
            ? u['xpAwarded']
            : 0,
      });
    }
    return unlocked;
  }

  private persist(unlocked: UnlockedAchievement[]): void {
    const store: AchievementsStore = {
      version: ACHIEVEMENTS_VERSION,
      unlocked,
    };
    try {
      localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(store));
    } catch {
      // Ignore.
    }
  }
}
