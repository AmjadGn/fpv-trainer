export const PLAYER_PROGRESS_VERSION = 1;
export const PLAYER_PROGRESS_STORAGE_KEY = 'fpv-trainer.player-progress.v1';

/** Display level cap. */
export const PLAYER_LEVEL_CAP = 50;

/** XP required to go from level L to L+1: 100 + (L - 1) * 50. */
export const XP_BASE_PER_LEVEL = 100;
export const XP_INCREMENT_PER_LEVEL = 50;

export const XP_REWARDS = {
  trainingComplete: 40,
  trainingGold: 25,
  trainingSilver: 15,
  trainingBronze: 8,
  raceComplete: 30,
  cleanRace: 20,
  gatePass: 2,
  achievementDefault: 50,
} as const;

export interface PlayerProgress {
  level: number;
  experiencePoints: number;
  completedTrainingModules: string[];
  goldMedals: number;
  silverMedals: number;
  bronzeMedals: number;
  completedRaces: number;
  totalFlightTimeMs: number;
  gatesCompleted: number;
  crashes: number;
  bestTimes: Record<string, number>;
  achievementsUnlocked: string[];
}

export interface PlayerLevelInfo {
  level: number;
  experiencePoints: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressRatio: number;
  isMaxLevel: boolean;
}

export function createDefaultPlayerProgress(): PlayerProgress {
  return {
    level: 1,
    experiencePoints: 0,
    completedTrainingModules: [],
    goldMedals: 0,
    silverMedals: 0,
    bronzeMedals: 0,
    completedRaces: 0,
    totalFlightTimeMs: 0,
    gatesCompleted: 0,
    crashes: 0,
    bestTimes: {},
    achievementsUnlocked: [],
  };
}

/** XP needed to advance from level L to L+1. */
export function xpForLevel(level: number): number {
  const L = Math.max(1, Math.floor(level));
  return XP_BASE_PER_LEVEL + (L - 1) * XP_INCREMENT_PER_LEVEL;
}

/** Level derived from total XP (level 1 at 0 XP). Capped at PLAYER_LEVEL_CAP. */
export function levelFromXp(experiencePoints: number): number {
  const xp = Number.isFinite(experiencePoints)
    ? Math.max(0, experiencePoints)
    : 0;
  let level = 1;
  let remaining = xp;
  while (level < PLAYER_LEVEL_CAP) {
    const need = xpForLevel(level);
    if (remaining < need) {
      break;
    }
    remaining -= need;
    level += 1;
  }
  return level;
}

/** Progress within the current level toward the next. */
export function xpProgressInLevel(experiencePoints: number): {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressRatio: number;
  isMaxLevel: boolean;
} {
  const xp = Number.isFinite(experiencePoints)
    ? Math.max(0, experiencePoints)
    : 0;
  const level = levelFromXp(xp);
  const isMaxLevel = level >= PLAYER_LEVEL_CAP;

  let consumed = 0;
  for (let L = 1; L < level; L++) {
    consumed += xpForLevel(L);
  }
  const xpIntoLevel = Math.max(0, xp - consumed);
  const xpForNextLevel = isMaxLevel ? 0 : xpForLevel(level);
  const progressRatio = isMaxLevel
    ? 1
    : xpForNextLevel > 0
      ? Math.min(1, xpIntoLevel / xpForNextLevel)
      : 1;

  return {
    level,
    xpIntoLevel,
    xpForNextLevel,
    progressRatio: Number.isFinite(progressRatio) ? progressRatio : 0,
    isMaxLevel,
  };
}
