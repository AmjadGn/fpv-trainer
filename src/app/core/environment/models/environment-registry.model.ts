import type { EnvironmentQuality } from '../models/environment.model';
import type { EnvironmentDefinition } from '../models/environment.model';

export type EnvironmentTheme =
  | 'alpine'
  | 'desert-industrial'
  | 'coastal'
  | 'fallback';

export type EnvironmentDifficulty =
  | 'beginner'
  | 'intermediate'
  | 'advanced';

export interface EnvironmentThumbnailConfig {
  style: 'alpine' | 'desert' | 'coastal' | 'generic';
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

/**
 * Serializable environment metadata for menus and compatibility checks.
 * Generation params live on {@link EnvironmentDefinition}.
 */
export interface EnvironmentMetadata {
  id: string;
  version: number;
  name: string;
  description: string;
  theme: EnvironmentTheme;
  difficulty: EnvironmentDifficulty;
  worldSize: number;
  supportedCourses: readonly string[];
  supportedTrainingModules: readonly string[];
  recommendedQuality: EnvironmentQuality;
  supportsVegetation: boolean;
  supportsPrecipitation: readonly ('none' | 'rain' | 'lightSnow' | 'dust')[];
  supportsFog: boolean;
  supportsWind: boolean;
  thumbnail: EnvironmentThumbnailConfig;
  enabled: boolean;
  comingSoon: boolean;
  defaultWeatherPresetId: string;
  /** Authoring definition used by generators. */
  definition: EnvironmentDefinition;
}

export interface EnvironmentCompatibility {
  environmentId: string;
  environmentVersion: number;
  courseIds: readonly string[];
  trainingModuleIds: readonly string[];
  weatherPresetIds: readonly string[];
}

export const ALPINE_ENVIRONMENT_ID = 'alpine-training-valley';
export const DESERT_ENVIRONMENT_ID = 'desert-industrial-yard';
export const COASTAL_ENVIRONMENT_ID = 'coastal-ruins';
export const FALLBACK_ENVIRONMENT_ID = 'fallback-flat';
