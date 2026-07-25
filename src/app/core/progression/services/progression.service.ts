import { Injectable, computed, signal } from '@angular/core';

import type { TrainingMedal, TrainingResult } from '../../academy/models/training-module.models';
import {
  PLAYER_PROGRESS_STORAGE_KEY,
  PLAYER_PROGRESS_VERSION,
  XP_REWARDS,
  createDefaultPlayerProgress,
  levelFromXp,
  xpProgressInLevel,
  type PlayerLevelInfo,
  type PlayerProgress,
} from '../models/player-progress.models';

/**
 * Player XP, stats, and training/race aggregates with versioned persistence.
 */
@Injectable({ providedIn: 'root' })
export class ProgressionService {
  private readonly progressSignal = signal<PlayerProgress>(
    this.loadFromStorage(),
  );

  readonly progress = this.progressSignal.asReadonly();
  readonly levelInfo = computed(() => this.getLevelInfo());

  getProgress(): PlayerProgress {
    return this.progressSignal();
  }

  getLevelInfo(): PlayerLevelInfo {
    const p = this.progressSignal();
    const info = xpProgressInLevel(p.experiencePoints);
    return {
      level: info.level,
      experiencePoints: p.experiencePoints,
      xpIntoLevel: info.xpIntoLevel,
      xpForNextLevel: info.xpForNextLevel,
      progressRatio: info.progressRatio,
      isMaxLevel: info.isMaxLevel,
    };
  }

  awardXp(amount: number): PlayerProgress {
    const add =
      typeof amount === 'number' && Number.isFinite(amount)
        ? Math.max(0, Math.floor(amount))
        : 0;
    if (add <= 0) {
      return this.progressSignal();
    }
    const current = this.progressSignal();
    const experiencePoints = current.experiencePoints + add;
    const next: PlayerProgress = {
      ...current,
      experiencePoints,
      level: levelFromXp(experiencePoints),
    };
    this.commit(next);
    return next;
  }

  recordFlightTime(deltaMs: number): PlayerProgress {
    const add =
      typeof deltaMs === 'number' && Number.isFinite(deltaMs)
        ? Math.max(0, deltaMs)
        : 0;
    if (add <= 0) {
      return this.progressSignal();
    }
    const current = this.progressSignal();
    const next: PlayerProgress = {
      ...current,
      totalFlightTimeMs: current.totalFlightTimeMs + add,
    };
    this.commit(next);
    return next;
  }

  recordGate(): PlayerProgress {
    const current = this.progressSignal();
    const next: PlayerProgress = {
      ...current,
      gatesCompleted: current.gatesCompleted + 1,
    };
    this.commit(next);
    this.awardXp(XP_REWARDS.gatePass);
    return this.progressSignal();
  }

  recordCrash(): PlayerProgress {
    const current = this.progressSignal();
    const next: PlayerProgress = {
      ...current,
      crashes: current.crashes + 1,
    };
    this.commit(next);
    return next;
  }

  recordRaceComplete(
    courseId: string,
    options: { timeMs: number; clean?: boolean },
  ): PlayerProgress {
    const current = this.progressSignal();
    const timeMs =
      typeof options.timeMs === 'number' && Number.isFinite(options.timeMs)
        ? options.timeMs
        : 0;
    const bestTimes = { ...current.bestTimes };
    const prior = bestTimes[courseId];
    if (
      timeMs > 0 &&
      (prior === undefined || timeMs < prior)
    ) {
      bestTimes[courseId] = timeMs;
    }

    let next: PlayerProgress = {
      ...current,
      completedRaces: current.completedRaces + 1,
      bestTimes,
    };
    this.commit(next);
    this.awardXp(XP_REWARDS.raceComplete);
    if (options.clean) {
      this.awardXp(XP_REWARDS.cleanRace);
    }
    return this.progressSignal();
  }

  recordTrainingCompletion(result: TrainingResult): PlayerProgress {
    const current = this.progressSignal();
    const completedTrainingModules = current.completedTrainingModules.includes(
      result.moduleId,
    )
      ? current.completedTrainingModules
      : [...current.completedTrainingModules, result.moduleId];

    let next: PlayerProgress = {
      ...current,
      completedTrainingModules,
    };
    this.commit(next);

    if (result.completed) {
      this.awardXp(XP_REWARDS.trainingComplete);
      this.awardMedalXp(result.medal);
    }
    return this.progressSignal();
  }

  /**
   * Rebuild medal tallies from training progress medals (never double-count
   * blindly — replace counts from the provided tallies).
   */
  syncMedalsFromTraining(counts: {
    gold: number;
    silver: number;
    bronze: number;
  }): PlayerProgress {
    const current = this.progressSignal();
    const next: PlayerProgress = {
      ...current,
      goldMedals: Math.max(0, Math.floor(counts.gold)),
      silverMedals: Math.max(0, Math.floor(counts.silver)),
      bronzeMedals: Math.max(0, Math.floor(counts.bronze)),
    };
    this.commit(next);
    return next;
  }

  markAchievementUnlocked(achievementId: string): PlayerProgress {
    const current = this.progressSignal();
    if (current.achievementsUnlocked.includes(achievementId)) {
      return current;
    }
    const next: PlayerProgress = {
      ...current,
      achievementsUnlocked: [
        ...current.achievementsUnlocked,
        achievementId,
      ],
    };
    this.commit(next);
    return next;
  }

  private awardMedalXp(medal: TrainingMedal): void {
    if (medal === 'gold') {
      this.awardXp(XP_REWARDS.trainingGold);
    } else if (medal === 'silver') {
      this.awardXp(XP_REWARDS.trainingSilver);
    } else if (medal === 'bronze') {
      this.awardXp(XP_REWARDS.trainingBronze);
    }
  }

  private commit(next: PlayerProgress): void {
    this.progressSignal.set(next);
    this.persist(next);
  }

  private loadFromStorage(): PlayerProgress {
    try {
      const raw = localStorage.getItem(PLAYER_PROGRESS_STORAGE_KEY);
      if (!raw) {
        return createDefaultPlayerProgress();
      }
      const parsed: unknown = JSON.parse(raw);
      return this.migrate(parsed);
    } catch {
      return createDefaultPlayerProgress();
    }
  }

  private migrate(raw: unknown): PlayerProgress {
    if (!raw || typeof raw !== 'object') {
      return createDefaultPlayerProgress();
    }
    const obj = raw as Record<string, unknown>;
    const version =
      typeof obj['version'] === 'number' && Number.isFinite(obj['version'])
        ? obj['version']
        : 0;
    if (version > PLAYER_PROGRESS_VERSION) {
      return createDefaultPlayerProgress();
    }

    const defaults = createDefaultPlayerProgress();
    const bestTimesRaw =
      obj['bestTimes'] && typeof obj['bestTimes'] === 'object'
        ? (obj['bestTimes'] as Record<string, unknown>)
        : {};
    const bestTimes: Record<string, number> = {};
    for (const [k, v] of Object.entries(bestTimesRaw)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        bestTimes[k] = v;
      }
    }

    const modules = Array.isArray(obj['completedTrainingModules'])
      ? obj['completedTrainingModules'].filter(
          (id): id is string => typeof id === 'string',
        )
      : [];
    const achievements = Array.isArray(obj['achievementsUnlocked'])
      ? obj['achievementsUnlocked'].filter(
          (id): id is string => typeof id === 'string',
        )
      : [];

    const experiencePoints =
      typeof obj['experiencePoints'] === 'number' &&
      Number.isFinite(obj['experiencePoints'])
        ? Math.max(0, obj['experiencePoints'])
        : 0;

    return {
      level: levelFromXp(experiencePoints),
      experiencePoints,
      completedTrainingModules: modules,
      goldMedals: this.nonNegInt(obj['goldMedals'], defaults.goldMedals),
      silverMedals: this.nonNegInt(obj['silverMedals'], defaults.silverMedals),
      bronzeMedals: this.nonNegInt(obj['bronzeMedals'], defaults.bronzeMedals),
      completedRaces: this.nonNegInt(
        obj['completedRaces'],
        defaults.completedRaces,
      ),
      totalFlightTimeMs: this.nonNegNum(
        obj['totalFlightTimeMs'],
        defaults.totalFlightTimeMs,
      ),
      gatesCompleted: this.nonNegInt(
        obj['gatesCompleted'],
        defaults.gatesCompleted,
      ),
      crashes: this.nonNegInt(obj['crashes'], defaults.crashes),
      bestTimes,
      achievementsUnlocked: achievements,
    };
  }

  private persist(progress: PlayerProgress): void {
    try {
      localStorage.setItem(
        PLAYER_PROGRESS_STORAGE_KEY,
        JSON.stringify({
          version: PLAYER_PROGRESS_VERSION,
          ...progress,
        }),
      );
    } catch {
      // Ignore.
    }
  }

  private nonNegInt(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    return fallback;
  }

  private nonNegNum(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, value);
    }
    return fallback;
  }
}
