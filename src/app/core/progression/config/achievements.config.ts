import type { AchievementDefinition } from '../models/achievement.models';

/**
 * Milestone achievement catalog for FPV Trainer progression.
 */
export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first-takeoff',
    title: 'First Takeoff',
    description: 'Arm and leave the ground for the first time.',
    category: 'flight',
    conditionType: 'takeoff',
    conditionConfig: { minAltitude: 0.5 },
    xpReward: 25,
  },
  {
    id: 'first-gate',
    title: 'First Gate',
    description: 'Pass through your first racing gate.',
    category: 'racing',
    conditionType: 'gates_completed',
    conditionConfig: { min: 1 },
    xpReward: 25,
  },
  {
    id: 'first-finish',
    title: 'First Finish',
    description: 'Complete the Starter Circuit.',
    category: 'racing',
    conditionType: 'event',
    conditionConfig: {
      eventType: 'race_finish',
      courseId: 'starter-circuit',
    },
    xpReward: 40,
  },
  {
    id: 'clean-run',
    title: 'Clean Run',
    description: 'Finish a race without crashes or invalid passes.',
    category: 'racing',
    conditionType: 'event',
    conditionConfig: { eventType: 'clean_finish' },
    xpReward: 50,
  },
  {
    id: 'ghost-hunter',
    title: 'Ghost Hunter',
    description: 'Beat your saved ghost on a course.',
    category: 'racing',
    conditionType: 'event',
    conditionConfig: { eventType: 'ghost_beaten' },
    xpReward: 60,
  },
  {
    id: 'hover-student',
    title: 'Hover Student',
    description: 'Complete the Hover Control training module.',
    category: 'training',
    conditionType: 'module_completed',
    conditionConfig: { moduleId: 'hover-control' },
    xpReward: 35,
  },
  {
    id: 'precision-pilot',
    title: 'Precision Pilot',
    description: 'Earn gold on Precision Landing.',
    category: 'training',
    conditionType: 'module_medal',
    conditionConfig: { moduleId: 'precision-landing', medal: 'gold' },
    xpReward: 75,
  },
  {
    id: 'gate-graduate',
    title: 'Gate Graduate',
    description: 'Complete Gate Basics.',
    category: 'training',
    conditionType: 'module_completed',
    conditionConfig: { moduleId: 'gate-basics' },
    xpReward: 35,
  },
  {
    id: 'figure-eight',
    title: 'Figure Eight',
    description: 'Complete the Figure Eight training module.',
    category: 'training',
    conditionType: 'module_completed',
    conditionConfig: { moduleId: 'figure-eight' },
    xpReward: 50,
  },
  {
    id: 'speed-improvement',
    title: 'Speed Improvement',
    description: 'Improve a personal best by at least 5%.',
    category: 'improvement',
    conditionType: 'best_improved_pct',
    conditionConfig: { minPct: 5 },
    xpReward: 45,
  },
  {
    id: 'persistent-pilot',
    title: 'Persistent Pilot',
    description: 'Complete 10 races.',
    category: 'endurance',
    conditionType: 'races_completed',
    conditionConfig: { min: 10 },
    xpReward: 80,
  },
  {
    id: 'air-time',
    title: 'Air Time',
    description: 'Accumulate 10 minutes of total flight time.',
    category: 'endurance',
    conditionType: 'flight_time_ms',
    conditionConfig: { minMs: 600_000 },
    xpReward: 70,
  },
];

export function getAchievementById(
  id: string,
): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
