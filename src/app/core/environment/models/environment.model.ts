import type { Quat, Vec3 } from '../../flight/models/flight-state.model';

export type EnvironmentQuality = 'low' | 'medium' | 'high';
export type TimeOfDay = 'morning' | 'midday' | 'sunset';

export interface SunSettings {
  azimuthDeg: number;
  elevationDeg: number;
  color: number;
  intensity: number;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  ambientIntensity: number;
  exposure: number;
  skyTurbidity: number;
  skyRayleigh: number;
  skyMieCoefficient: number;
  skyMieDirectionalG: number;
}

export interface FogSettings {
  color: number;
  near: number;
  far: number;
  enabled: boolean;
}

export interface TerrainSettings {
  width: number;
  depth: number;
  segmentsX: number;
  segmentsZ: number;
  baseHeight: number;
  hillAmplitude: number;
  hillFrequency: number;
  valleyWidth: number;
  valleyDepth: number;
  edgeMountainStrength: number;
  noiseOctaves: number;
  roughness: number;
  flattenStartAreaRadius: number;
  flattenGateAreaRadius: number;
}

export interface VegetationSettings {
  treeCount: number;
  bushCount: number;
  grassPatchCount: number;
  minimumCourseClearance: number;
  minimumSpawnClearance: number;
  densityFalloff: number;
}

export interface PropSettings {
  rockCount: number;
  flagCount: number;
  barrierCount: number;
  cabinEnabled: boolean;
  radioTowerEnabled: boolean;
}

export interface EnvironmentDefinition {
  id: string;
  name: string;
  description: string;
  seed: number;
  worldSize: number;
  terrainResolution: number;
  spawnPosition: Vec3;
  spawnOrientation: Quat;
  sun: SunSettings;
  fog: FogSettings;
  terrain: TerrainSettings;
  vegetation: VegetationSettings;
  props: PropSettings;
}

export interface PlacementInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotationY: number;
  variant: number;
}

export interface LandmarkPlacement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

export interface ClearancePoint {
  x: number;
  z: number;
  radius: number;
}

export type EnvironmentThemeId =
  | 'alpine'
  | 'desert-industrial'
  | 'coastal'
  | 'fallback';

export interface IndustrialScenery {
  containers: PlacementInstance[];
  warehouses: LandmarkPlacement[];
  /** variant: 0 horiz, 1 elevated */
  pipes: PlacementInstance[];
  towers: LandmarkPlacement[];
  concreteBarriers: PlacementInstance[];
  crane: LandmarkPlacement | null;
  utilityPoles: PlacementInstance[];
  landingMarkings: LandmarkPlacement[];
}

export interface CoastalScenery {
  walls: PlacementInstance[];
  arches: LandmarkPlacement[];
  columns: PlacementInstance[];
  watchtower: LandmarkPlacement | null;
  lighthouse: LandmarkPlacement | null;
  brokenTower: LandmarkPlacement | null;
  oceanEnabled: boolean;
  /** Ocean plane center (visual only). */
  oceanCenter: { x: number; z: number; y: number };
  oceanSize: number;
}

export interface GeneratedEnvironment {
  definitionId: string;
  seed: number;
  quality: EnvironmentQuality;
  theme: EnvironmentThemeId;
  worldSize: number;
  segmentsX: number;
  segmentsZ: number;
  /** Row-major heights: index = z * (segmentsX + 1) + x */
  heights: Float32Array;
  /** RGB vertex colors matching heights length * 3 */
  colors: Float32Array;
  trees: PlacementInstance[];
  bushes: PlacementInstance[];
  grassPatches: PlacementInstance[];
  rocks: PlacementInstance[];
  flags: PlacementInstance[];
  barriers: PlacementInstance[];
  cabin: LandmarkPlacement | null;
  radioTower: LandmarkPlacement | null;
  industrial: IndustrialScenery | null;
  coastal: CoastalScenery | null;
  startPad: LandmarkPlacement;
  clearancePoints: ClearancePoint[];
  timeOfDay: TimeOfDay;
  sun: SunSettings;
  fog: FogSettings;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  vegetationEnabled: boolean;
}

export interface EnvironmentQualityProfile {
  quality: EnvironmentQuality;
  terrainSegments: number;
  vegetationScale: number;
  shadowsRecommended: boolean;
  shadowMapSize: number;
  /** Optional cap for Rapier dynamic props at this quality tier. */
  maxDynamicProps?: number;
  /** Optional cap for impact / dust particle pools at this quality tier. */
  maxParticles?: number;
}

export const ENVIRONMENT_QUALITY_PROFILES: Record<
  EnvironmentQuality,
  EnvironmentQualityProfile
> = {
  low: {
    quality: 'low',
    terrainSegments: 64,
    vegetationScale: 0.45,
    shadowsRecommended: false,
    shadowMapSize: 512,
    maxDynamicProps: 8,
    maxParticles: 32,
  },
  medium: {
    quality: 'medium',
    terrainSegments: 128,
    vegetationScale: 1,
    shadowsRecommended: true,
    shadowMapSize: 1024,
    maxDynamicProps: 24,
    maxParticles: 64,
  },
  high: {
    quality: 'high',
    terrainSegments: 160,
    vegetationScale: 1.35,
    shadowsRecommended: true,
    shadowMapSize: 2048,
    maxDynamicProps: 48,
    maxParticles: 128,
  },
};

export type EnvironmentLoadStage =
  | 'idle'
  | 'validating'
  | 'disposingPrevious'
  | 'generatingTerrain'
  | 'generatingScenery'
  | 'generatingCourse'
  | 'preparingWeather'
  | 'terrain' // legacy alias used by renderer
  | 'vegetation'
  | 'course'
  | 'lighting'
  | 'ready'
  | 'error'
  | 'fallback';

export const ENVIRONMENT_LOAD_LABELS: Record<EnvironmentLoadStage, string> = {
  idle: 'Waiting',
  validating: 'Validating environment',
  disposingPrevious: 'Clearing previous scene',
  generatingTerrain: 'Generating terrain',
  generatingScenery: 'Building scenery',
  generatingCourse: 'Building course',
  preparingWeather: 'Preparing weather',
  terrain: 'Generating terrain',
  vegetation: 'Planting vegetation',
  course: 'Building course',
  lighting: 'Preparing lighting',
  ready: 'Ready',
  error: 'Environment failed',
  fallback: 'Loading safe fallback',
};
