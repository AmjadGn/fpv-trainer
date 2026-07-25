import type { WindState } from './wind.models';
import { ZERO_WIND_STATE, cloneWindState } from './wind.models';

export type PrecipitationType = 'none' | 'rain' | 'lightSnow' | 'dust';

/**
 * Record category for best times / ghosts.
 * Standard = Calm or approved light weather.
 * Challenge = stronger wind / reduced visibility / precip.
 */
export type WeatherRecordCategory = 'standard' | 'challenge';

export type WeatherDifficultyClass = 'standard' | 'assisted' | 'challenge';

export interface WeatherState {
  presetId: string;
  wind: WindState;
  /** 0–1 where 1 is clear. */
  visibility: number;
  /** Relative fog density multiplier (clamped in renderer). */
  fogDensity: number;
  /** 0–1 cloud coverage visual hint. */
  cloudCoverage: number;
  precipitationType: PrecipitationType;
  /** 0–1. */
  precipitationIntensity: number;
  /** 0–1 optional material wetness hint. */
  surfaceWetness: number;
  ambientLightMultiplier: number;
  sunLightMultiplier: number;
  temperatureVisualHint: number;
  transitionDurationSeconds: number;
  recordCategory: WeatherRecordCategory;
  difficultyClass: WeatherDifficultyClass;
}

export interface WeatherPresetDefinition {
  id: string;
  name: string;
  description: string;
  /** Environments that may use this preset (`*` = universal). */
  environments: readonly string[] | '*';
  state: Omit<WeatherState, 'presetId'>;
}

export const CALM_WEATHER_STATE: WeatherState = {
  presetId: 'calm',
  wind: { ...ZERO_WIND_STATE },
  visibility: 1,
  fogDensity: 0.35,
  cloudCoverage: 0.15,
  precipitationType: 'none',
  precipitationIntensity: 0,
  surfaceWetness: 0,
  ambientLightMultiplier: 1,
  sunLightMultiplier: 1,
  temperatureVisualHint: 0.55,
  transitionDurationSeconds: 4,
  recordCategory: 'standard',
  difficultyClass: 'standard',
};

export function cloneWeatherState(state: WeatherState): WeatherState {
  return {
    ...state,
    wind: cloneWindState(state.wind),
  };
}

export function isPrecipitationType(
  value: unknown,
): value is PrecipitationType {
  return (
    value === 'none' ||
    value === 'rain' ||
    value === 'lightSnow' ||
    value === 'dust'
  );
}

export function isWeatherRecordCategory(
  value: unknown,
): value is WeatherRecordCategory {
  return value === 'standard' || value === 'challenge';
}
