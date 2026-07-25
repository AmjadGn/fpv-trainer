/**
 * Weather challenge catalog (config-driven).
 * Challenges bind environment + course + weather preset + goals.
 */
export interface WeatherChallengeDefinition {
  id: string;
  version: number;
  title: string;
  description: string;
  environmentId: string;
  courseId: string;
  weatherPresetId: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  /** Max crashes allowed (null = unlimited). */
  maxCrashes: number | null;
  /** Target time seconds for medal scoring (null = no time goal). */
  targetTimeSeconds: number | null;
  /** Require zero crashes for success. */
  requireCleanRun: boolean;
  rewardXp: number;
  medalThresholds: { bronze: number; silver: number; gold: number };
  windStrengthLabel: string;
  visibilityLabel: string;
  enabled: boolean;
}

export const WEATHER_CHALLENGES: WeatherChallengeDefinition[] = [
  {
    id: 'alpine-crosswind',
    version: 1,
    title: 'Alpine Crosswind',
    description:
      'Complete Starter Circuit in a medium crosswind with mild gusts.',
    environmentId: 'alpine-training-valley',
    courseId: 'starter-circuit',
    weatherPresetId: 'crosswind',
    difficulty: 'intermediate',
    maxCrashes: 2,
    targetTimeSeconds: null,
    requireCleanRun: false,
    rewardXp: 120,
    medalThresholds: { bronze: 50, silver: 70, gold: 88 },
    windStrengthLabel: 'Medium (≈4.5 m/s)',
    visibilityLabel: 'Clear',
    enabled: true,
  },
  {
    id: 'industrial-gust-run',
    version: 1,
    title: 'Industrial Gust Run',
    description:
      'Race Industrial Sprint through gusty yard winds and dust haze.',
    environmentId: 'desert-industrial-yard',
    courseId: 'industrial-sprint',
    weatherPresetId: 'desert-gusty-yard',
    difficulty: 'advanced',
    maxCrashes: 3,
    targetTimeSeconds: 75,
    requireCleanRun: false,
    rewardXp: 150,
    medalThresholds: { bronze: 50, silver: 70, gold: 90 },
    windStrengthLabel: 'Gusty (≈7 m/s)',
    visibilityLabel: 'Dust haze',
    enabled: true,
  },
  {
    id: 'coastal-rain-flight',
    version: 1,
    title: 'Coastal Rain Flight',
    description:
      'Fly Coastal Run in a sea breeze with light rain — no crashes.',
    environmentId: 'coastal-ruins',
    courseId: 'coastal-run',
    weatherPresetId: 'coastal-light-rain',
    difficulty: 'intermediate',
    maxCrashes: 0,
    targetTimeSeconds: null,
    requireCleanRun: true,
    rewardXp: 140,
    medalThresholds: { bronze: 55, silver: 75, gold: 92 },
    windStrengthLabel: 'Sea breeze (≈3.5 m/s)',
    visibilityLabel: 'Moderate rain',
    enabled: true,
  },
];

export function getWeatherChallengeById(
  id: string,
): WeatherChallengeDefinition | undefined {
  return WEATHER_CHALLENGES.find((c) => c.id === id && c.enabled);
}

export function listEnabledWeatherChallenges(): WeatherChallengeDefinition[] {
  return WEATHER_CHALLENGES.filter((c) => c.enabled);
}

export function challengeToBriefTips(
  challenge: WeatherChallengeDefinition,
): string[] {
  return [
    `Environment wind: ${challenge.windStrengthLabel}`,
    `Visibility: ${challenge.visibilityLabel}`,
    challenge.requireCleanRun
      ? 'Clean run required — any crash fails the challenge.'
      : challenge.maxCrashes != null
        ? `Crash budget: ${challenge.maxCrashes}`
        : 'Fly clean for a higher medal.',
    challenge.targetTimeSeconds != null
      ? `Target time: under ${challenge.targetTimeSeconds}s`
      : 'Focus on completing the course.',
  ];
}
