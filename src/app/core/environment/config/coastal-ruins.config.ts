import { quatFromYaw } from '../../course/models/course.model';
import type {
  EnvironmentDefinition,
  FogSettings,
  SunSettings,
  TimeOfDay,
} from '../models/environment.model';

export const COASTAL_RUINS_SEED = 20260724;

export const COASTAL_TIME_OF_DAY_PRESETS: Record<
  TimeOfDay,
  { sun: SunSettings; fog: FogSettings }
> = {
  morning: {
    sun: {
      azimuthDeg: -60,
      elevationDeg: 24,
      color: 0xffe8d0,
      intensity: 1.05,
      hemisphereSky: 0xc8e0f0,
      hemisphereGround: 0x4a5a50,
      hemisphereIntensity: 0.78,
      ambientIntensity: 0.2,
      exposure: 1.05,
      skyTurbidity: 3.5,
      skyRayleigh: 2.4,
      skyMieCoefficient: 0.0038,
      skyMieDirectionalG: 0.8,
    },
    fog: {
      color: 0xc0d4e0,
      near: 90,
      far: 460,
      enabled: true,
    },
  },
  midday: {
    sun: {
      azimuthDeg: 30,
      elevationDeg: 52,
      color: 0xf0f4f8,
      intensity: 1.1,
      hemisphereSky: 0xb8c8d8,
      hemisphereGround: 0x3e4a48,
      hemisphereIntensity: 0.8,
      ambientIntensity: 0.22,
      exposure: 0.98,
      skyTurbidity: 6,
      skyRayleigh: 1.6,
      skyMieCoefficient: 0.0045,
      skyMieDirectionalG: 0.78,
    },
    fog: {
      color: 0xb0c0cc,
      near: 80,
      far: 440,
      enabled: true,
    },
  },
  sunset: {
    sun: {
      azimuthDeg: 100,
      elevationDeg: 11,
      color: 0xffa878,
      intensity: 1.18,
      hemisphereSky: 0xe8b8a0,
      hemisphereGround: 0x3a3830,
      hemisphereIntensity: 0.7,
      ambientIntensity: 0.24,
      exposure: 1.1,
      skyTurbidity: 8.5,
      skyRayleigh: 2.9,
      skyMieCoefficient: 0.0065,
      skyMieDirectionalG: 0.74,
    },
    fog: {
      color: 0xc8b0a0,
      near: 70,
      far: 400,
      enabled: true,
    },
  },
};

const midday = COASTAL_TIME_OF_DAY_PRESETS.midday;

export const COASTAL_RUINS: EnvironmentDefinition = {
  id: 'coastal-ruins',
  name: 'Coastal Ruins',
  description:
    'A seaside plateau of weathered ruins with inland hills, sea haze, and open flight lanes.',
  seed: COASTAL_RUINS_SEED,
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
    hillAmplitude: 6,
    hillFrequency: 0.011,
    valleyWidth: 0.58,
    valleyDepth: 1.2,
    edgeMountainStrength: 28,
    noiseOctaves: 4,
    roughness: 0.42,
    flattenStartAreaRadius: 18,
    flattenGateAreaRadius: 10,
  },
  vegetation: {
    treeCount: 80,
    bushCount: 100,
    grassPatchCount: 70,
    minimumCourseClearance: 11,
    minimumSpawnClearance: 18,
    densityFalloff: 0.5,
  },
  props: {
    rockCount: 40,
    flagCount: 8,
    barrierCount: 6,
    cabinEnabled: false,
    radioTowerEnabled: false,
  },
};

export function applyCoastalTimeOfDay(
  definition: EnvironmentDefinition,
  timeOfDay: TimeOfDay,
): EnvironmentDefinition {
  const preset =
    COASTAL_TIME_OF_DAY_PRESETS[timeOfDay] ?? COASTAL_TIME_OF_DAY_PRESETS.midday;
  return {
    ...definition,
    sun: { ...preset.sun },
    fog: { ...preset.fog },
  };
}
