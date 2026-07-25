import { quatFromYaw } from '../../course/models/course.model';
import type {
  EnvironmentDefinition,
  FogSettings,
  SunSettings,
  TimeOfDay,
} from '../models/environment.model';

export const DESERT_INDUSTRIAL_SEED = 20260723;

export const DESERT_TIME_OF_DAY_PRESETS: Record<
  TimeOfDay,
  { sun: SunSettings; fog: FogSettings }
> = {
  morning: {
    sun: {
      azimuthDeg: -48,
      elevationDeg: 26,
      color: 0xffd4a0,
      intensity: 1.1,
      hemisphereSky: 0xe8d0b0,
      hemisphereGround: 0x6a5538,
      hemisphereIntensity: 0.72,
      ambientIntensity: 0.2,
      exposure: 1.08,
      skyTurbidity: 5.5,
      skyRayleigh: 1.8,
      skyMieCoefficient: 0.005,
      skyMieDirectionalG: 0.78,
    },
    fog: {
      color: 0xe0c8a8,
      near: 100,
      far: 480,
      enabled: true,
    },
  },
  midday: {
    sun: {
      azimuthDeg: 40,
      elevationDeg: 62,
      color: 0xfff0d0,
      intensity: 1.35,
      hemisphereSky: 0xf0e4c8,
      hemisphereGround: 0x5c4a30,
      hemisphereIntensity: 0.9,
      ambientIntensity: 0.28,
      exposure: 1.12,
      skyTurbidity: 3.2,
      skyRayleigh: 1.0,
      skyMieCoefficient: 0.004,
      skyMieDirectionalG: 0.8,
    },
    fog: {
      color: 0xd8c4a0,
      near: 140,
      far: 560,
      enabled: true,
    },
  },
  sunset: {
    sun: {
      azimuthDeg: 112,
      elevationDeg: 10,
      color: 0xff9460,
      intensity: 1.2,
      hemisphereSky: 0xf0b890,
      hemisphereGround: 0x4a3420,
      hemisphereIntensity: 0.68,
      ambientIntensity: 0.24,
      exposure: 1.1,
      skyTurbidity: 9,
      skyRayleigh: 2.6,
      skyMieCoefficient: 0.007,
      skyMieDirectionalG: 0.72,
    },
    fog: {
      color: 0xd4a078,
      near: 70,
      far: 420,
      enabled: true,
    },
  },
};

const midday = DESERT_TIME_OF_DAY_PRESETS.midday;

export const DESERT_INDUSTRIAL_YARD: EnvironmentDefinition = {
  id: 'desert-industrial-yard',
  name: 'Desert Industrial Yard',
  description:
    'A sun-baked industrial yard with flat flight lanes, distant dunes, and sparse scrub.',
  seed: DESERT_INDUSTRIAL_SEED,
  worldSize: 750,
  terrainResolution: 128,
  spawnPosition: { x: 0, y: 1, z: 8 },
  spawnOrientation: quatFromYaw(0),
  sun: { ...midday.sun },
  fog: { ...midday.fog },
  terrain: {
    width: 750,
    depth: 750,
    segmentsX: 128,
    segmentsZ: 128,
    baseHeight: 0,
    hillAmplitude: 3,
    hillFrequency: 0.01,
    valleyWidth: 0.55,
    valleyDepth: 0.8,
    edgeMountainStrength: 18,
    noiseOctaves: 3,
    roughness: 0.35,
    flattenStartAreaRadius: 22,
    flattenGateAreaRadius: 12,
  },
  vegetation: {
    treeCount: 12,
    bushCount: 40,
    grassPatchCount: 20,
    minimumCourseClearance: 14,
    minimumSpawnClearance: 22,
    densityFalloff: 0.65,
  },
  props: {
    rockCount: 36,
    flagCount: 8,
    barrierCount: 14,
    cabinEnabled: false,
    radioTowerEnabled: false,
  },
};

export function applyDesertTimeOfDay(
  definition: EnvironmentDefinition,
  timeOfDay: TimeOfDay,
): EnvironmentDefinition {
  const preset =
    DESERT_TIME_OF_DAY_PRESETS[timeOfDay] ?? DESERT_TIME_OF_DAY_PRESETS.midday;
  return {
    ...definition,
    sun: { ...preset.sun },
    fog: { ...preset.fog },
  };
}
