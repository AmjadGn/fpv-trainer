import type { EnvironmentQuality } from '../../environment/models/environment.model';
import type { PrecipitationType } from '../models/weather.models';

export interface PrecipitationBudget {
  maxParticles: number;
  enabled: boolean;
}

/** Cap particle counts by quality and reduced-motion preferences. */
export function precipitationBudget(
  type: PrecipitationType,
  intensity: number,
  quality: EnvironmentQuality,
  options?: { reduceMotion?: boolean; precipitationEnabled?: boolean },
): PrecipitationBudget {
  if (
    type === 'none' ||
    intensity <= 0.01 ||
    options?.precipitationEnabled === false
  ) {
    return { maxParticles: 0, enabled: false };
  }

  if (quality === 'low' && type === 'rain') {
    return { maxParticles: 0, enabled: false };
  }

  const base =
    type === 'rain' ? 420 : type === 'lightSnow' ? 280 : type === 'dust' ? 180 : 0;

  const qualityScale =
    quality === 'high' ? 1 : quality === 'medium' ? 0.65 : 0.35;
  const motionScale = options?.reduceMotion ? 0.35 : 1;
  const count = Math.round(base * intensity * qualityScale * motionScale);

  return {
    maxParticles: Math.max(0, Math.min(600, count)),
    enabled: count > 0,
  };
}

/** Rain/snow fall direction given wind (camera-relative helpers use this). */
export function precipitationFallDirection(
  windX: number,
  windZ: number,
  fallSpeed: number,
): { x: number; y: number; z: number } {
  const wx = Number.isFinite(windX) ? windX : 0;
  const wz = Number.isFinite(windZ) ? windZ : 0;
  const fy = -(fallSpeed > 0 ? fallSpeed : 8);
  return { x: wx * 0.35, y: fy, z: wz * 0.35 };
}
