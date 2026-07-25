import { quatFromYaw } from '../../course/models/course.model';
import type {
  EnvironmentDefinition,
  FogSettings,
  SunSettings,
  TimeOfDay,
} from '../models/environment.model';

export const ALPINE_VALLEY_SEED = 20260722;

export const TIME_OF_DAY_PRESETS: Record<
  TimeOfDay,
  { sun: SunSettings; fog: FogSettings }
> = {
  morning: {
    sun: {
      azimuthDeg: -55,
      elevationDeg: 28,
      color: 0xffe0b8,
      intensity: 1.05,
      hemisphereSky: 0xb8d4f0,
      hemisphereGround: 0x4a5540,
      hemisphereIntensity: 0.75,
      ambientIntensity: 0.18,
      exposure: 1.05,
      skyTurbidity: 4.5,
      skyRayleigh: 2.2,
      skyMieCoefficient: 0.004,
      skyMieDirectionalG: 0.8,
    },
    fog: {
      color: 0xc5d8ea,
      near: 120,
      far: 520,
      enabled: true,
    },
  },
  midday: {
    sun: {
      azimuthDeg: 35,
      elevationDeg: 58,
      color: 0xfff2d6,
      intensity: 1.2,
      hemisphereSky: 0xcfe8ff,
      hemisphereGround: 0x3d4a3a,
      hemisphereIntensity: 0.85,
      ambientIntensity: 0.2,
      exposure: 1.0,
      skyTurbidity: 2.5,
      skyRayleigh: 1.1,
      skyMieCoefficient: 0.0035,
      skyMieDirectionalG: 0.8,
    },
    fog: {
      color: 0xb8cfe0,
      near: 160,
      far: 580,
      enabled: true,
    },
  },
  sunset: {
    sun: {
      azimuthDeg: 105,
      elevationDeg: 12,
      color: 0xffb07a,
      intensity: 1.15,
      hemisphereSky: 0xf0c8a8,
      hemisphereGround: 0x3a3228,
      hemisphereIntensity: 0.7,
      ambientIntensity: 0.22,
      exposure: 1.08,
      skyTurbidity: 8,
      skyRayleigh: 2.8,
      skyMieCoefficient: 0.006,
      skyMieDirectionalG: 0.75,
    },
    fog: {
      color: 0xd4b8a0,
      near: 90,
      far: 480,
      enabled: true,
    },
  },
};

const midday = TIME_OF_DAY_PRESETS.midday;

/**
 * Alpine Training Valley — procedural FPV practice environment.
 * Central corridor stays near y = 0 for flat-ground physics compatibility.
 */
export const ALPINE_TRAINING_VALLEY: EnvironmentDefinition = {
  id: 'alpine-training-valley',
  name: 'Alpine Training Valley',
  description:
    'A procedural alpine valley with rolling hills, perimeter mountains, and a clear beginner flight corridor.',
  seed: ALPINE_VALLEY_SEED,
  worldSize: 800,
  terrainResolution: 128,
  spawnPosition: { x: 0, y: 1, z: 6 },
  spawnOrientation: quatFromYaw(0),
  sun: { ...midday.sun },
  fog: { ...midday.fog },
  terrain: {
    width: 800,
    depth: 800,
    segmentsX: 128,
    segmentsZ: 128,
    baseHeight: 0,
    hillAmplitude: 9,
    hillFrequency: 0.012,
    valleyWidth: 0.42,
    valleyDepth: 2,
    edgeMountainStrength: 55,
    noiseOctaves: 4,
    roughness: 0.48,
    flattenStartAreaRadius: 18,
    flattenGateAreaRadius: 10,
  },
  vegetation: {
    treeCount: 220,
    bushCount: 160,
    grassPatchCount: 90,
    minimumCourseClearance: 9,
    minimumSpawnClearance: 16,
    densityFalloff: 0.55,
  },
  props: {
    rockCount: 48,
    flagCount: 10,
    barrierCount: 8,
    cabinEnabled: true,
    radioTowerEnabled: true,
  },
};

export function applyTimeOfDayToDefinition(
  definition: EnvironmentDefinition,
  timeOfDay: TimeOfDay,
): EnvironmentDefinition {
  const preset = TIME_OF_DAY_PRESETS[timeOfDay] ?? TIME_OF_DAY_PRESETS.midday;
  return {
    ...definition,
    sun: { ...preset.sun },
    fog: { ...preset.fog },
  };
}
