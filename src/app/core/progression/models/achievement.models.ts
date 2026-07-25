export type AchievementCategory =
  | 'flight'
  | 'racing'
  | 'training'
  | 'improvement'
  | 'endurance';

export type AchievementConditionType =
  | 'takeoff'
  | 'gates_completed'
  | 'races_completed'
  | 'event'
  | 'module_completed'
  | 'module_medal'
  | 'flight_time_ms'
  | 'best_improved_pct';

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  conditionType: AchievementConditionType;
  conditionConfig: Record<string, unknown>;
  xpReward: number;
  hidden?: boolean;
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: string;
  xpAwarded: number;
}

export const ACHIEVEMENTS_STORAGE_KEY = 'fpv-trainer.achievements.v1';
export const ACHIEVEMENTS_VERSION = 1;

export interface AchievementsStore {
  version: number;
  unlocked: UnlockedAchievement[];
}
