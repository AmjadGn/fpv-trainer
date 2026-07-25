import type { Course } from '../../course/models/course.model';
import type { TrainerEnvironmentSettings } from '../../settings/models/trainer-settings.model';
import type {
  ClearancePoint,
  EnvironmentDefinition,
  EnvironmentQuality,
  GeneratedEnvironment,
  IndustrialScenery,
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

export function generateDesertIndustrial(options: {
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

  const vegScale = settings.vegetation ? profile.vegetationScale * 0.35 : 0;

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

  const rng = new SeededRandom(mixSeed(definition.seed, 0xde5e47));

  const bushes =
    vegScale > 0
      ? placeSparseProps({
          count: Math.round(28 * vegScale),
          rng,
          grid,
          definition,
          clearancePoints,
          scaleRange: [0.45, 1.05],
          maxHeight: 14,
        })
      : [];

  const rocks = placeSparseProps({
    count: Math.round(
      18 * (quality === 'low' ? 0.6 : quality === 'high' ? 1.15 : 1),
    ),
    rng,
    grid,
    definition,
    clearancePoints,
    scaleRange: [0.55, 1.8],
    maxHeight: 22,
  });
  for (const slot of DESERT_SCATTER_LAYOUT) {
    const placed = placeWithJitter(
      slot.x,
      slot.z,
      clearancePoints,
      2,
      rng,
      0.8,
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

  const industrial = buildIndustrialScenery({
    rng,
    grid,
    definition,
    clearancePoints,
    course,
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
    theme: 'desert-industrial',
    worldSize: definition.worldSize,
    segmentsX: segments,
    segmentsZ: segments,
    heights: grid.heights,
    colors: grid.colors,
    trees: [],
    bushes,
    grassPatches: [],
    rocks,
    flags,
    barriers: [],
    cabin: null,
    radioTower: null,
    industrial,
    coastal: null,
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

/** Essential corridor containers — always placed (quality does not remove). */
const CORRIDOR_CONTAINER_LAYOUT: ReadonlyArray<{
  x: number;
  z: number;
  yaw: number;
  variant: number;
}> = [
  // Left-side cluster A — opening gaps for flight sightlines
  { x: -28, z: -14, yaw: 0, variant: 0 },
  { x: -32, z: -18, yaw: Math.PI / 2, variant: 1 },
  { x: -26, z: -22, yaw: 0.1, variant: 0 },
  { x: -34, z: -26, yaw: Math.PI / 2, variant: 2 },
  // Gap corridor, then cluster B near gate 2–3
  { x: -30, z: -40, yaw: 0, variant: 1 },
  { x: -36, z: -44, yaw: Math.PI / 2, variant: 0 },
  { x: -28, z: -48, yaw: -0.08, variant: 2 },
  { x: -38, z: -52, yaw: Math.PI / 2, variant: 1 },
  // Cluster C mid-course left
  { x: -42, z: -68, yaw: 0.15, variant: 0 },
  { x: -36, z: -72, yaw: Math.PI / 2, variant: 2 },
  { x: -44, z: -76, yaw: 0, variant: 1 },
  { x: -32, z: -80, yaw: Math.PI / 2, variant: 0 },
  // Cluster D deeper left
  { x: -48, z: -92, yaw: 0.2, variant: 1 },
  { x: -40, z: -96, yaw: Math.PI / 2, variant: 0 },
  { x: -46, z: -104, yaw: -0.12, variant: 2 },
  { x: -34, z: -108, yaw: Math.PI / 2, variant: 1 },
];

/** Distant decorative containers — may be trimmed on low quality. */
const DISTANT_CONTAINER_LAYOUT: ReadonlyArray<{
  x: number;
  z: number;
  yaw: number;
  variant: number;
}> = [
  { x: -55, z: -20, yaw: Math.PI / 4, variant: 0 },
  { x: -60, z: -35, yaw: 0, variant: 1 },
  { x: -58, z: -58, yaw: Math.PI / 2, variant: 2 },
  { x: -62, z: -85, yaw: 0.3, variant: 0 },
  { x: -50, z: -120, yaw: Math.PI / 2, variant: 1 },
  { x: 42, z: -30, yaw: -Math.PI / 5, variant: 0 },
  { x: 48, z: -55, yaw: Math.PI / 2, variant: 2 },
  { x: 52, z: -90, yaw: 0.1, variant: 1 },
  { x: 38, z: -115, yaw: Math.PI / 3, variant: 0 },
  { x: -22, z: -130, yaw: 0, variant: 2 },
  { x: 8, z: -140, yaw: Math.PI / 2, variant: 1 },
  { x: -70, z: -70, yaw: 0.4, variant: 0 },
  { x: 65, z: -45, yaw: -0.2, variant: 1 },
  { x: -65, z: -110, yaw: Math.PI / 2, variant: 2 },
  { x: 55, z: -130, yaw: 0, variant: 0 },
  { x: -15, z: 25, yaw: Math.PI / 6, variant: 1 },
  { x: 25, z: 20, yaw: -Math.PI / 4, variant: 0 },
  { x: -45, z: 15, yaw: Math.PI / 2, variant: 2 },
  { x: 60, z: -15, yaw: 0.15, variant: 1 },
  { x: -75, z: -40, yaw: -0.3, variant: 0 },
  { x: 70, z: -75, yaw: Math.PI / 2, variant: 2 },
  { x: -5, z: -145, yaw: 0, variant: 1 },
  { x: 30, z: -150, yaw: Math.PI / 5, variant: 0 },
  { x: -80, z: -95, yaw: Math.PI / 2, variant: 2 },
];

const WAREHOUSE_LAYOUT: ReadonlyArray<{
  x: number;
  z: number;
  yaw: number;
}> = [
  { x: -35, z: -55, yaw: Math.PI / 8 },
  { x: 30, z: -70, yaw: -Math.PI / 10 },
  { x: -40, z: -100, yaw: 0.2 },
];

const PIPE_LAYOUT: ReadonlyArray<{
  x: number;
  z: number;
  yaw: number;
  variant: number;
}> = [
  { x: -22, z: -50, yaw: Math.PI / 2, variant: 1 },
  { x: -18, z: -52, yaw: Math.PI / 2, variant: 1 },
  { x: -14, z: -54, yaw: Math.PI / 2, variant: 1 },
  { x: -24, z: -56, yaw: 0, variant: 0 },
  { x: -20, z: -58, yaw: 0.1, variant: 0 },
  { x: -16, z: -48, yaw: Math.PI / 2, variant: 1 },
  { x: -26, z: -60, yaw: 0, variant: 0 },
  { x: -12, z: -56, yaw: Math.PI / 2, variant: 1 },
  { x: -28, z: -54, yaw: 0.05, variant: 0 },
  { x: -30, z: -62, yaw: Math.PI / 2, variant: 0 },
];

const TOWER_LAYOUT: ReadonlyArray<{ x: number; z: number; yaw: number }> = [
  { x: -50, z: -30, yaw: 0 },
  { x: 45, z: -100, yaw: Math.PI / 6 },
];

const BARRIER_LAYOUT: ReadonlyArray<{
  x: number;
  z: number;
  yaw: number;
}> = [
  { x: -20, z: -34, yaw: Math.PI / 2 },
  { x: -10, z: -70, yaw: 0.3 },
  { x: 8, z: -86, yaw: -0.4 },
  { x: 18, z: -98, yaw: Math.PI / 5 },
  { x: -6, z: -112, yaw: 0 },
  { x: 4, z: -20, yaw: Math.PI / 2 },
  // Fence-like perimeter hints along the yard edge.
  { x: -52, z: -58, yaw: 0.05 },
  { x: -48, z: -62, yaw: 0.05 },
  { x: 44, z: -72, yaw: -Math.PI / 2 },
  { x: 44, z: -76, yaw: -Math.PI / 2 },
];

/** Deterministic scatter rocks / crate piles away from the flight corridor. */
const DESERT_SCATTER_LAYOUT: ReadonlyArray<{
  x: number;
  z: number;
  scale: number;
  variant: number;
}> = [
  { x: -58, z: -32, scale: 1.1, variant: 1 },
  { x: -62, z: -48, scale: 0.85, variant: 0 },
  { x: 50, z: -58, scale: 1.25, variant: 2 },
  { x: 54, z: -82, scale: 0.95, variant: 1 },
  { x: -46, z: -118, scale: 1.4, variant: 0 },
  { x: 36, z: -124, scale: 1.05, variant: 2 },
];

function buildIndustrialScenery(args: {
  rng: SeededRandom;
  grid: BuiltTerrainGrid;
  definition: EnvironmentDefinition;
  clearancePoints: ClearancePoint[];
  course: Course;
  quality: EnvironmentQuality;
}): IndustrialScenery {
  const { rng, grid, definition, clearancePoints, course, quality } = args;

  const containers: PlacementInstance[] = [];

  for (const slot of CORRIDOR_CONTAINER_LAYOUT) {
    const placed = placeWithJitter(
      slot.x,
      slot.z,
      clearancePoints,
      3.5,
      rng,
      1,
    );
    if (!placed) {
      continue;
    }
    containers.push({
      x: placed.x,
      y: terrainHeightAt(placed.x, placed.z, grid),
      z: placed.z,
      scale: rng.range(0.9, 1.15),
      rotationY: slot.yaw + rng.range(-0.05, 0.05),
      variant: slot.variant,
    });
  }

  const distantBudget =
    quality === 'low' ? 8 : quality === 'high' ? 24 : 16;
  for (let i = 0; i < Math.min(distantBudget, DISTANT_CONTAINER_LAYOUT.length); i++) {
    const slot = DISTANT_CONTAINER_LAYOUT[i]!;
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
    containers.push({
      x: placed.x,
      y: terrainHeightAt(placed.x, placed.z, grid),
      z: placed.z,
      scale: rng.range(0.85, 1.2),
      rotationY: slot.yaw + rng.range(-0.08, 0.08),
      variant: slot.variant,
    });
  }

  const warehouses: LandmarkPlacement[] = [];
  for (const wh of WAREHOUSE_LAYOUT) {
    const placed = placeWithJitter(wh.x, wh.z, clearancePoints, 6, rng, 1.5);
    if (!placed) {
      warehouses.push({
        x: wh.x,
        y: terrainHeightAt(wh.x, wh.z, grid),
        z: wh.z,
        yaw: wh.yaw,
        scale: 1,
      });
      continue;
    }
    warehouses.push({
      x: placed.x,
      y: terrainHeightAt(placed.x, placed.z, grid),
      z: placed.z,
      yaw: wh.yaw,
      scale: 1,
    });
  }

  const pipeCount = quality === 'low' ? 6 : quality === 'high' ? 10 : 8;
  const pipes: PlacementInstance[] = [];
  for (let i = 0; i < pipeCount; i++) {
    const slot = PIPE_LAYOUT[i]!;
    const placed = placeWithJitter(
      slot.x,
      slot.z,
      clearancePoints,
      2.5,
      rng,
      0.8,
    );
    if (!placed) {
      continue;
    }
    pipes.push({
      x: placed.x,
      y: terrainHeightAt(placed.x, placed.z, grid),
      z: placed.z,
      scale: 1,
      rotationY: slot.yaw,
      variant: slot.variant,
    });
  }

  const towers: LandmarkPlacement[] = TOWER_LAYOUT.map((t) => {
    const placed = placeWithJitter(t.x, t.z, clearancePoints, 4, rng, 1.2);
    const x = placed?.x ?? t.x;
    const z = placed?.z ?? t.z;
    return {
      x,
      y: terrainHeightAt(x, z, grid),
      z,
      yaw: t.yaw,
      scale: 1,
    };
  });

  const concreteBarriers: PlacementInstance[] = [];
  for (const b of BARRIER_LAYOUT) {
    const placed = placeWithJitter(b.x, b.z, clearancePoints, 2, rng, 0.9);
    if (!placed) {
      continue;
    }
    concreteBarriers.push({
      x: placed.x,
      y: terrainHeightAt(placed.x, placed.z, grid),
      z: placed.z,
      scale: 1,
      rotationY: b.yaw,
      variant: 0,
    });
  }

  // Deterministic crate stacks near warehouse periphery (visual + future dynamic props).
  const crateSpots: ReadonlyArray<{ x: number; z: number; variant: number }> = [
    { x: -38, z: -58, variant: 0 },
    { x: -36, z: -60, variant: 1 },
    { x: 28, z: -74, variant: 2 },
    { x: 30, z: -72, variant: 0 },
  ];
  for (const spot of crateSpots) {
    const placed = placeWithJitter(
      spot.x,
      spot.z,
      clearancePoints,
      2.5,
      rng,
      0.6,
    );
    if (!placed) {
      continue;
    }
    containers.push({
      x: placed.x,
      y: terrainHeightAt(placed.x, placed.z, grid),
      z: placed.z,
      scale: rng.range(0.55, 0.72),
      rotationY: rng.range(-0.15, 0.15),
      variant: spot.variant,
    });
  }

  // Crane is essential — always present, nudge if needed.
  const cranePos =
    placeWithJitter(18, -82, clearancePoints, 5, rng, 1.5) ?? {
      x: 18,
      z: -82,
    };
  const crane: LandmarkPlacement = {
    x: cranePos.x,
    y: terrainHeightAt(cranePos.x, cranePos.z, grid),
    z: cranePos.z,
    yaw: -Math.PI / 6,
    scale: 1,
  };

  const utilityPoles: PlacementInstance[] = [];
  const poleCount = quality === 'low' ? 8 : quality === 'high' ? 16 : 12;
  const half = definition.worldSize * 0.42;
  for (let i = 0; i < poleCount; i++) {
    const t = i / Math.max(1, poleCount - 1);
    // Edge runs along ±X and far −Z boundary.
    const edge = i % 3;
    let x: number;
    let z: number;
    if (edge === 0) {
      x = -half + rng.range(-1, 1);
      z = lerp(-20, -140, t) + rng.range(-2, 2);
    } else if (edge === 1) {
      x = half + rng.range(-1, 1);
      z = lerp(-10, -130, t) + rng.range(-2, 2);
    } else {
      x = lerp(-half * 0.8, half * 0.8, t) + rng.range(-2, 2);
      z = -half + rng.range(-1, 1);
    }
    if (hitsClearance(x, z, clearancePoints, 2)) {
      continue;
    }
    if (!withinWorld(x, z, definition.worldSize)) {
      continue;
    }
    utilityPoles.push({
      x,
      y: terrainHeightAt(x, z, grid),
      z,
      scale: 1,
      rotationY: 0,
      variant: 0,
    });
  }

  const start = course.startPosition;
  const landingMarkings: LandmarkPlacement[] = [
    {
      x: start.x,
      y: 0.02,
      z: start.z,
      yaw: 0,
      scale: 1,
    },
    {
      x: start.x + 3.5,
      y: 0.02,
      z: start.z + 1.5,
      yaw: Math.PI / 2,
      scale: 0.85,
    },
  ];

  return {
    containers,
    warehouses,
    pipes,
    towers,
    concreteBarriers,
    crane,
    utilityPoles,
    landingMarkings,
  };
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
  // Radial nudge away from nearest clearance center.
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

function placeSparseProps(args: {
  count: number;
  rng: SeededRandom;
  grid: BuiltTerrainGrid;
  definition: EnvironmentDefinition;
  clearancePoints: ClearancePoint[];
  scaleRange: [number, number];
  maxHeight: number;
}): PlacementInstance[] {
  const {
    count,
    rng,
    grid,
    definition,
    clearancePoints,
    scaleRange,
    maxHeight,
  } = args;
  const out: PlacementInstance[] = [];
  const half = definition.worldSize * 0.45;
  const maxAttempts = count * 16;

  for (let i = 0; i < maxAttempts && out.length < count; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const radius = rng.range(half * 0.18, half * 0.9);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (hitsClearance(x, z, clearancePoints, 1.5)) {
      continue;
    }
    if (!withinWorld(x, z, definition.worldSize)) {
      continue;
    }
    const y = terrainHeightAt(x, z, grid);
    if (y > maxHeight || y < -0.5) {
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function assertFiniteHeights(grid: BuiltTerrainGrid): void {
  for (let i = 0; i < grid.heights.length; i++) {
    if (!Number.isFinite(grid.heights[i]!)) {
      throw new Error('Non-finite terrain height');
    }
  }
}
