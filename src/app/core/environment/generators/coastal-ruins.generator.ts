import type { Course } from '../../course/models/course.model';
import type { TrainerEnvironmentSettings } from '../../settings/models/trainer-settings.model';
import type {
  ClearancePoint,
  CoastalScenery,
  EnvironmentDefinition,
  EnvironmentQuality,
  GeneratedEnvironment,
  LandmarkPlacement,
  PlacementInstance,
  TimeOfDay,
} from '../models/environment.model';
import { ENVIRONMENT_QUALITY_PROFILES } from '../models/environment.model';
import { SeededRandom, mixSeed } from '../utils/seeded-random';
import {
  buildTerrainGrid,
  terrainHeightAt,
  type FlattenZone,
  type BuiltTerrainGrid,
} from '../utils/terrain-generation';

export function generateCoastalRuins(options: {
  definition: EnvironmentDefinition;
  course: Course;
  settings: TrainerEnvironmentSettings;
}): GeneratedEnvironment {
  const { definition, course, settings } = options;
  const quality: EnvironmentQuality = settings.quality ?? 'medium';
  const profile =
    ENVIRONMENT_QUALITY_PROFILES[quality] ??
    ENVIRONMENT_QUALITY_PROFILES.medium;
  const timeOfDay: TimeOfDay = settings.timeOfDay ?? 'midday';

  const segments = Math.max(
    32,
    Math.min(192, profile.terrainSegments || definition.terrainResolution),
  );

  const vegScale = settings.vegetation ? profile.vegetationScale * 0.4 : 0;

  const clearancePoints = buildClearancePoints(course, definition);
  const flattenZones = clearancePoints.map(
    (c): FlattenZone => ({
      x: c.x,
      z: c.z,
      radius: c.radius,
      targetHeight: 0,
    }),
  );

  const terrainSettings = {
    ...definition.terrain,
    segmentsX: segments,
    segmentsZ: segments,
  };

  const grid = buildTerrainGrid(
    {
      settings: terrainSettings,
      seed: definition.seed,
      flattenZones,
      corridorRadius: definition.worldSize * 0.14,
    },
    segments,
    segments,
  );
  assertFiniteHeights(grid);

  const rng = new SeededRandom(mixSeed(definition.seed, 0xc0a57a1));

  const trees =
    vegScale > 0
      ? placeWindsweptTrees({
          count: Math.round(36 * vegScale),
          rng,
          grid,
          definition,
          clearancePoints,
        })
      : [];

  const bushes =
    vegScale > 0
      ? placeSparseBushes({
          count: Math.round(22 * vegScale),
          rng,
          grid,
          definition,
          clearancePoints,
        })
      : [];

  const rocks = placeSparseBushes({
    count: Math.round(
      14 * (quality === 'low' ? 0.55 : quality === 'high' ? 1.2 : 1),
    ),
    rng,
    grid,
    definition,
    clearancePoints,
    scaleRange: [0.6, 1.9],
  });
  for (const slot of COASTAL_SCATTER_LAYOUT) {
    const placed = placeWithJitter(
      slot.x,
      slot.z,
      clearancePoints,
      1.8,
      rng,
      0.7,
    );
    if (!placed) {
      continue;
    }
    rocks.push({
      x: placed.x,
      y: terrainHeightAt(placed.x, placed.z, grid),
      z: placed.z,
      scale: slot.scale,
      rotationY: rng.range(0, Math.PI * 2),
      variant: slot.variant,
    });
  }

  const flags = placeFlags(definition.props.flagCount, rng, course, grid);

  const coastal = buildCoastalScenery({
    rng,
    grid,
    definition,
    clearancePoints,
    quality,
  });

  const start = course.startPosition;
  const startPad: LandmarkPlacement = {
    x: start.x,
    y: 0.03,
    z: start.z,
    yaw: 0,
    scale: 1,
  };

  const shadowsEnabled = settings.shadows && profile.shadowsRecommended;
  const fog = {
    ...definition.fog,
    enabled: settings.fog && definition.fog.enabled,
  };

  return {
    definitionId: definition.id,
    seed: definition.seed,
    quality,
    theme: 'coastal',
    worldSize: definition.worldSize,
    segmentsX: segments,
    segmentsZ: segments,
    heights: grid.heights,
    colors: grid.colors,
    trees,
    bushes,
    grassPatches: [],
    rocks,
    flags,
    barriers: [],
    cabin: null,
    radioTower: null,
    industrial: null,
    coastal,
    startPad,
    clearancePoints,
    timeOfDay,
    sun: definition.sun,
    fog,
    shadowsEnabled,
    shadowMapSize: profile.shadowMapSize,
    vegetationEnabled: settings.vegetation,
  };
}

const WALL_LAYOUT: ReadonlyArray<{
  x: number;
  z: number;
  yaw: number;
  variant: number;
}> = [
  { x: -24, z: -28, yaw: Math.PI / 2, variant: 0 },
  { x: -26, z: -42, yaw: 0.2, variant: 1 },
  { x: -30, z: -60, yaw: Math.PI / 2, variant: 0 },
  { x: 22, z: -48, yaw: -0.15, variant: 1 },
  { x: 26, z: -72, yaw: Math.PI / 2, variant: 0 },
  { x: -22, z: -88, yaw: 0.1, variant: 1 },
  { x: 20, z: -105, yaw: -Math.PI / 8, variant: 0 },
  { x: -36, z: -78, yaw: Math.PI / 3, variant: 1 },
  { x: 32, z: -38, yaw: 0, variant: 0 },
  { x: -18, z: -118, yaw: Math.PI / 2, variant: 1 },
];

const COLUMN_LAYOUT: ReadonlyArray<{
  x: number;
  z: number;
  yaw: number;
  variant: number;
}> = [
  { x: -20, z: -32, yaw: 0, variant: 0 },
  { x: -16, z: -40, yaw: 0.2, variant: 1 },
  { x: 16, z: -56, yaw: 0, variant: 0 },
  { x: 20, z: -68, yaw: -0.1, variant: 2 },
  { x: -28, z: -74, yaw: 0.3, variant: 1 },
  { x: 24, z: -92, yaw: 0, variant: 0 },
  { x: -14, z: -100, yaw: 0.15, variant: 2 },
  { x: 12, z: -28, yaw: 0, variant: 1 },
];

/** Coastal scatter rocks and low fence-like barrier stones. */
const COASTAL_SCATTER_LAYOUT: ReadonlyArray<{
  x: number;
  z: number;
  scale: number;
  variant: number;
}> = [
  { x: -44, z: -52, scale: 1.15, variant: 0 },
  { x: 38, z: -64, scale: 0.9, variant: 1 },
  { x: -34, z: -108, scale: 1.3, variant: 2 },
  { x: 46, z: -88, scale: 1.05, variant: 0 },
  { x: -8, z: -132, scale: 0.8, variant: 1 },
];

const COASTAL_FENCE_LAYOUT: ReadonlyArray<{
  x: number;
  z: number;
  yaw: number;
  variant: number;
}> = [
  { x: -52, z: -36, yaw: Math.PI / 2, variant: 0 },
  { x: -52, z: -40, yaw: Math.PI / 2, variant: 1 },
  { x: 48, z: -52, yaw: -Math.PI / 2, variant: 0 },
  { x: 48, z: -56, yaw: -Math.PI / 2, variant: 1 },
];

function buildCoastalScenery(args: {
  rng: SeededRandom;
  grid: BuiltTerrainGrid;
  definition: EnvironmentDefinition;
  clearancePoints: ClearancePoint[];
  quality: EnvironmentQuality;
}): CoastalScenery {
  const { rng, grid, definition, clearancePoints, quality } = args;
  const worldSize = definition.worldSize;

  // Keep at least 5 framing walls; only distant extras trim on low.
  const wallBudget = quality === 'low' ? 6 : quality === 'high' ? 10 : 8;
  const walls: PlacementInstance[] = [];
  for (let i = 0; i < Math.min(wallBudget, WALL_LAYOUT.length); i++) {
    const slot = WALL_LAYOUT[i]!;
    const placed = placeWithJitter(
      slot.x,
      slot.z,
      clearancePoints,
      3,
      rng,
      1,
    );
    if (!placed) {
      continue;
    }
    walls.push({
      x: placed.x,
      y: terrainHeightAt(placed.x, placed.z, grid),
      z: placed.z,
      scale: rng.range(0.9, 1.15),
      rotationY: slot.yaw + rng.range(-0.06, 0.06),
      variant: slot.variant,
    });
  }

  // Arch near gate 3 (~-12,-36) offset so it does not intersect the gate.
  const archPos =
    placeWithJitter(-18, -36, clearancePoints, 4.5, rng, 1) ?? {
      x: -18,
      z: -36,
    };
  const arches: LandmarkPlacement[] = [
    {
      x: archPos.x,
      y: terrainHeightAt(archPos.x, archPos.z, grid),
      z: archPos.z,
      yaw: Math.PI / 5,
      scale: 1,
    },
  ];

  const columnBudget = quality === 'low' ? 5 : quality === 'high' ? 8 : 6;
  const columns: PlacementInstance[] = [];
  for (let i = 0; i < Math.min(columnBudget, COLUMN_LAYOUT.length); i++) {
    const slot = COLUMN_LAYOUT[i]!;
    const placed = placeWithJitter(
      slot.x,
      slot.z,
      clearancePoints,
      2.5,
      rng,
      0.9,
    );
    if (!placed) {
      continue;
    }
    columns.push({
      x: placed.x,
      y: terrainHeightAt(placed.x, placed.z, grid),
      z: placed.z,
      scale: rng.range(0.85, 1.2),
      rotationY: slot.yaw,
      variant: slot.variant,
    });
  }

  for (const fence of COASTAL_FENCE_LAYOUT) {
    const placed = placeWithJitter(
      fence.x,
      fence.z,
      clearancePoints,
      2,
      rng,
      0.5,
    );
    if (!placed) {
      continue;
    }
    walls.push({
      x: placed.x,
      y: terrainHeightAt(placed.x, placed.z, grid),
      z: placed.z,
      scale: rng.range(0.55, 0.72),
      rotationY: fence.yaw + rng.range(-0.04, 0.04),
      variant: fence.variant,
    });
  }

  const watchPos =
    placeWithJitter(14, -62, clearancePoints, 5, rng, 1.2) ?? {
      x: 14,
      z: -62,
    };
  const watchtower: LandmarkPlacement = {
    x: watchPos.x,
    y: terrainHeightAt(watchPos.x, watchPos.z, grid),
    z: watchPos.z,
    yaw: -Math.PI / 8,
    scale: 1,
  };

  // Lighthouse on +X edge toward −Z sea.
  const lightPos =
    placeWithJitter(55, -40, clearancePoints, 4, rng, 1.5) ?? {
      x: 55,
      z: -40,
    };
  const lighthouse: LandmarkPlacement = {
    x: lightPos.x,
    y: terrainHeightAt(lightPos.x, lightPos.z, grid),
    z: lightPos.z,
    yaw: Math.PI / 10,
    scale: 1,
  };

  const brokenPos =
    placeWithJitter(-42, -95, clearancePoints, 4, rng, 1.2) ?? {
      x: -42,
      z: -95,
    };
  const brokenTower: LandmarkPlacement = {
    x: brokenPos.x,
    y: terrainHeightAt(brokenPos.x, brokenPos.z, grid),
    z: brokenPos.z,
    yaw: 0.35,
    scale: 1,
  };

  return {
    walls,
    arches,
    columns,
    watchtower,
    lighthouse,
    brokenTower,
    oceanEnabled: true,
    oceanCenter: { x: 0, z: worldSize * 0.42, y: 0 },
    oceanSize: worldSize * 0.9,
  };
}

function placeWindsweptTrees(args: {
  count: number;
  rng: SeededRandom;
  grid: BuiltTerrainGrid;
  definition: EnvironmentDefinition;
  clearancePoints: ClearancePoint[];
}): PlacementInstance[] {
  const { count, rng, grid, definition, clearancePoints } = args;
  const out: PlacementInstance[] = [];
  const half = definition.worldSize * 0.48;
  const spawnClear = definition.vegetation.minimumSpawnClearance;
  const maxAttempts = count * 18;

  for (let attempt = 0; attempt < maxAttempts && out.length < count; attempt++) {
    const angle = rng.range(0, Math.PI * 2);
    const radius = rng.range(half * 0.28, half * 0.92);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    if (!withinWorld(x, z, definition.worldSize)) {
      continue;
    }
    if (hitsClearance(x, z, clearancePoints, 0)) {
      continue;
    }
    if (
      Math.hypot(x - definition.spawnPosition.x, z - definition.spawnPosition.z) <
      spawnClear
    ) {
      continue;
    }

    const y = terrainHeightAt(x, z, grid);
    if (y < 0.2 || y > 22) {
      continue;
    }
    const dy =
      Math.abs(terrainHeightAt(x + 2, z, grid) - y) +
      Math.abs(terrainHeightAt(x, z + 2, grid) - y);
    if (dy > 16) {
      continue;
    }

    out.push({
      x,
      y,
      z,
      scale: rng.range(0.65, 1.25),
      rotationY: rng.range(0, Math.PI * 2),
      variant: rng.int(0, 2),
    });
  }
  return out;
}

function placeSparseBushes(args: {
  count: number;
  rng: SeededRandom;
  grid: BuiltTerrainGrid;
  definition: EnvironmentDefinition;
  clearancePoints: ClearancePoint[];
  scaleRange?: [number, number];
}): PlacementInstance[] {
  const {
    count,
    rng,
    grid,
    definition,
    clearancePoints,
    scaleRange = [0.5, 1.1],
  } = args;
  const out: PlacementInstance[] = [];
  const half = definition.worldSize * 0.45;
  const maxAttempts = count * 16;

  for (let i = 0; i < maxAttempts && out.length < count; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const radius = rng.range(half * 0.15, half * 0.88);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (hitsClearance(x, z, clearancePoints, 1.2)) {
      continue;
    }
    if (!withinWorld(x, z, definition.worldSize)) {
      continue;
    }
    const y = terrainHeightAt(x, z, grid);
    if (y > 18 || y < -0.4) {
      continue;
    }
    out.push({
      x,
      y,
      z,
      scale: rng.range(scaleRange[0], scaleRange[1]),
      rotationY: rng.range(0, Math.PI * 2),
      variant: rng.int(0, 2),
    });
  }
  return out;
}

function placeFlags(
  count: number,
  rng: SeededRandom,
  course: Course,
  grid: BuiltTerrainGrid,
): PlacementInstance[] {
  const out: PlacementInstance[] = [];
  const gates = course.gates;
  if (gates.length === 0) {
    return out;
  }

  const preferred = [2, 3, 4, 5, 6, 7].filter((i) => i < gates.length);
  const targets =
    preferred.length > 0
      ? preferred
      : gates.map((_, i) => i).slice(0, Math.min(count, gates.length));

  for (let i = 0; i < Math.min(count, targets.length); i++) {
    const gate = gates[targets[i]!]!;
    const side = i % 2 === 0 ? 1 : -1;
    const offset = gate.width * 0.5 + 1.8 + rng.range(0, 0.8);
    const x = gate.position.x + side * offset * 0.85;
    const z = gate.position.z + rng.range(-1.2, 1.2);
    out.push({
      x,
      y: terrainHeightAt(x, z, grid),
      z,
      scale: rng.range(0.9, 1.15),
      rotationY: rng.range(-0.2, 0.2),
      variant: i % 3,
    });
  }
  return out;
}

function placeWithJitter(
  x: number,
  z: number,
  clearancePoints: ClearancePoint[],
  padding: number,
  rng: SeededRandom,
  jitter: number,
): { x: number; z: number } | null {
  for (let attempt = 0; attempt < 8; attempt++) {
    const px = x + rng.range(-jitter, jitter);
    const pz = z + rng.range(-jitter, jitter);
    if (!hitsClearance(px, pz, clearancePoints, padding)) {
      return { x: px, z: pz };
    }
  }
  for (const step of [4, 7, 10, 14]) {
    for (const angle of [0, 1.2, 2.4, 3.6, 4.8, 6.0]) {
      const px = x + Math.cos(angle) * step;
      const pz = z + Math.sin(angle) * step;
      if (!hitsClearance(px, pz, clearancePoints, padding)) {
        return { x: px, z: pz };
      }
    }
  }
  return null;
}

function buildClearancePoints(
  course: Course,
  definition: EnvironmentDefinition,
): ClearancePoint[] {
  const points: ClearancePoint[] = [
    {
      x: course.startPosition.x,
      z: course.startPosition.z,
      radius: definition.terrain.flattenStartAreaRadius,
    },
  ];

  for (const gate of course.gates) {
    points.push({
      x: gate.position.x,
      z: gate.position.z,
      radius: Math.max(
        definition.terrain.flattenGateAreaRadius,
        gate.width * 0.85 +
          definition.vegetation.minimumCourseClearance * 0.35,
      ),
    });
  }

  for (let i = 0; i < course.gates.length - 1; i++) {
    const a = course.gates[i]!;
    const b = course.gates[i + 1]!;
    points.push({
      x: (a.position.x + b.position.x) * 0.5,
      z: (a.position.z + b.position.z) * 0.5,
      radius: definition.vegetation.minimumCourseClearance * 0.85,
    });
  }

  return points;
}

function hitsClearance(
  x: number,
  z: number,
  points: ClearancePoint[],
  padding: number,
): boolean {
  for (const p of points) {
    if (Math.hypot(x - p.x, z - p.z) < p.radius + padding) {
      return true;
    }
  }
  return false;
}

function withinWorld(x: number, z: number, worldSize: number): boolean {
  const half = worldSize * 0.5 - 4;
  return Math.abs(x) <= half && Math.abs(z) <= half;
}

function assertFiniteHeights(grid: BuiltTerrainGrid): void {
  for (let i = 0; i < grid.heights.length; i++) {
    if (!Number.isFinite(grid.heights[i]!)) {
      throw new Error('Non-finite terrain height');
    }
  }
}
