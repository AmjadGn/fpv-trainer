import { Injectable } from '@angular/core';

import type { Course } from '../../course/models/course.model';
import {
  ALPINE_TRAINING_VALLEY,
  applyTimeOfDayToDefinition,
} from '../config/alpine-valley.config';
import {
  applyCoastalTimeOfDay,
} from '../config/coastal-ruins.config';
import {
  applyDesertTimeOfDay,
} from '../config/desert-industrial.config';
import { generateCoastalRuins } from '../generators/coastal-ruins.generator';
import { generateDesertIndustrial } from '../generators/desert-industrial.generator';
import type {
  ClearancePoint,
  EnvironmentDefinition,
  EnvironmentQuality,
  GeneratedEnvironment,
  LandmarkPlacement,
  PlacementInstance,
  TimeOfDay,
} from '../models/environment.model';
import { ENVIRONMENT_QUALITY_PROFILES } from '../models/environment.model';
import {
  COASTAL_ENVIRONMENT_ID,
  DESERT_ENVIRONMENT_ID,
} from '../models/environment-registry.model';
import type { TrainerEnvironmentSettings } from '../../settings/models/trainer-settings.model';
import { SeededRandom, mixSeed } from '../utils/seeded-random';
import {
  buildTerrainGrid,
  createFallbackFlatGrid,
  sampleTerrainHeight,
  terrainHeightAt,
  type FlattenZone,
  type BuiltTerrainGrid,
} from '../utils/terrain-generation';

export interface GenerateEnvironmentOptions {
  definition?: EnvironmentDefinition;
  course: Course;
  settings: TrainerEnvironmentSettings;
  /** Force a minimal flat fallback environment. */
  fallback?: boolean;
}

@Injectable({ providedIn: 'root' })
export class EnvironmentGeneratorService {
  generate(options: GenerateEnvironmentOptions): GeneratedEnvironment {
    try {
      if (options.fallback) {
        return this.buildFallback(options);
      }

      const baseDef = options.definition ?? ALPINE_TRAINING_VALLEY;
      const timeOfDay: TimeOfDay = options.settings.timeOfDay ?? 'midday';

      switch (baseDef.id) {
        case DESERT_ENVIRONMENT_ID: {
          const definition = applyDesertTimeOfDay(baseDef, timeOfDay);
          return generateDesertIndustrial({
            definition,
            course: options.course,
            settings: options.settings,
          });
        }
        case COASTAL_ENVIRONMENT_ID: {
          const definition = applyCoastalTimeOfDay(baseDef, timeOfDay);
          return generateCoastalRuins({
            definition,
            course: options.course,
            settings: options.settings,
          });
        }
        default: {
          const definition = applyTimeOfDayToDefinition(baseDef, timeOfDay);
          return this.buildAlpine({ ...options, definition });
        }
      }
    } catch {
      return this.buildFallback(options);
    }
  }

  private buildAlpine(
    options: GenerateEnvironmentOptions,
  ): GeneratedEnvironment {
    const baseDef = options.definition ?? ALPINE_TRAINING_VALLEY;
    const quality = options.settings.quality;
    const profile =
      ENVIRONMENT_QUALITY_PROFILES[quality] ??
      ENVIRONMENT_QUALITY_PROFILES.medium;
    const timeOfDay: TimeOfDay = options.settings.timeOfDay ?? 'midday';
    // Time-of-day may already be applied by generate(); re-apply is idempotent.
    const definition = applyTimeOfDayToDefinition(baseDef, timeOfDay);

    const segments = Math.max(
      32,
      Math.min(192, profile.terrainSegments || definition.terrainResolution),
    );

    const vegScale = options.settings.vegetation
      ? profile.vegetationScale
      : 0;

    const clearancePoints = this.buildClearancePoints(
      options.course,
      definition,
    );
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

    const sampleOptions = {
      settings: terrainSettings,
      seed: definition.seed,
      flattenZones,
      corridorRadius: definition.worldSize * 0.12,
    };

    const grid = buildTerrainGrid(sampleOptions, segments, segments);
    this.assertFiniteHeights(grid);

    const rng = new SeededRandom(mixSeed(definition.seed, 0x51a11e));

    const trees =
      vegScale > 0
        ? this.placeVegetation({
            count: Math.round(definition.vegetation.treeCount * vegScale),
            rng,
            grid,
            definition,
            clearancePoints,
            minHeight: 0.4,
            maxHeight: 28,
            maxSlopeProxy: 18,
            preferEdge: true,
            scaleRange: [0.75, 1.45],
          })
        : [];

    const bushes =
      vegScale > 0
        ? this.placeVegetation({
            count: Math.round(definition.vegetation.bushCount * vegScale),
            rng,
            grid,
            definition,
            clearancePoints,
            minHeight: 0.1,
            maxHeight: 16,
            maxSlopeProxy: 22,
            preferEdge: false,
            scaleRange: [0.55, 1.2],
          })
        : [];

    const grassPatches =
      vegScale > 0
        ? this.placeVegetation({
            count: Math.round(
              definition.vegetation.grassPatchCount * vegScale,
            ),
            rng,
            grid,
            definition,
            clearancePoints,
            minHeight: -0.2,
            maxHeight: 6,
            maxSlopeProxy: 10,
            preferEdge: false,
            scaleRange: [0.7, 1.3],
            favorCorridorEdge: true,
          })
        : [];

    const rocks = this.placeRocks(
      Math.round(
        definition.props.rockCount *
          (quality === 'low' ? 0.55 : quality === 'high' ? 1.2 : 1),
      ),
      rng,
      grid,
      definition,
      clearancePoints,
    );
    this.placeAlpineScatterRocks(rocks, rng, grid, definition, clearancePoints);

    const flags = this.placeFlags(
      definition.props.flagCount,
      rng,
      options.course,
      grid,
    );

    const barriers = this.placeBarriers(
      definition.props.barrierCount,
      rng,
      grid,
      definition,
      clearancePoints,
    );
    this.placeAlpineFenceBarriers(barriers, rng, grid, definition, clearancePoints);

    const cabin = definition.props.cabinEnabled
      ? this.placeCabin(rng, grid, definition, clearancePoints)
      : null;

    const radioTower = definition.props.radioTowerEnabled
      ? this.placeRadioTower(rng, grid, definition)
      : null;

    const start = options.course.startPosition;
    const startPad: LandmarkPlacement = {
      x: start.x,
      y: 0.03,
      z: start.z,
      yaw: 0,
      scale: 1,
    };

    const shadowsEnabled =
      options.settings.shadows && profile.shadowsRecommended;
    const fog = {
      ...definition.fog,
      enabled: options.settings.fog && definition.fog.enabled,
    };

    return {
      definitionId: definition.id,
      seed: definition.seed,
      quality,
      theme: 'alpine',
      worldSize: definition.worldSize,
      segmentsX: segments,
      segmentsZ: segments,
      heights: grid.heights,
      colors: grid.colors,
      trees,
      bushes,
      grassPatches,
      rocks,
      flags,
      barriers,
      cabin,
      radioTower,
      industrial: null,
      coastal: null,
      startPad,
      clearancePoints,
      timeOfDay,
      sun: definition.sun,
      fog,
      shadowsEnabled,
      shadowMapSize: profile.shadowMapSize,
      vegetationEnabled: options.settings.vegetation,
    };
  }

  private buildFallback(
    options: GenerateEnvironmentOptions,
  ): GeneratedEnvironment {
    const quality: EnvironmentQuality = options.settings.quality ?? 'medium';
    const profile =
      ENVIRONMENT_QUALITY_PROFILES[quality] ??
      ENVIRONMENT_QUALITY_PROFILES.medium;
    const timeOfDay: TimeOfDay = options.settings.timeOfDay ?? 'midday';
    const definition = applyTimeOfDayToDefinition(
      ALPINE_TRAINING_VALLEY,
      timeOfDay,
    );
    const segments = 32;
    const grid = createFallbackFlatGrid(240, 240, segments);
    const start = options.course.startPosition;

    return {
      definitionId: 'fallback-flat',
      seed: 0,
      quality,
      theme: 'fallback',
      worldSize: 240,
      segmentsX: segments,
      segmentsZ: segments,
      heights: grid.heights,
      colors: grid.colors,
      trees: [],
      bushes: [],
      grassPatches: [],
      rocks: [],
      flags: [],
      barriers: [],
      cabin: null,
      radioTower: null,
      industrial: null,
      coastal: null,
      startPad: {
        x: start.x,
        y: 0.03,
        z: start.z,
        yaw: 0,
        scale: 1,
      },
      clearancePoints: this.buildClearancePoints(options.course, definition),
      timeOfDay,
      sun: definition.sun,
      fog: {
        ...definition.fog,
        enabled: options.settings.fog,
        far: 280,
      },
      shadowsEnabled: false,
      shadowMapSize: profile.shadowMapSize,
      vegetationEnabled: false,
    };
  }

  private buildClearancePoints(
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
          gate.width * 0.85 + definition.vegetation.minimumCourseClearance * 0.35,
        ),
      });
    }

    // Soft corridor discs between consecutive gates.
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

  private placeVegetation(args: {
    count: number;
    rng: SeededRandom;
    grid: BuiltTerrainGrid;
    definition: EnvironmentDefinition;
    clearancePoints: ClearancePoint[];
    minHeight: number;
    maxHeight: number;
    maxSlopeProxy: number;
    preferEdge: boolean;
    scaleRange: [number, number];
    favorCorridorEdge?: boolean;
  }): PlacementInstance[] {
    const {
      count,
      rng,
      grid,
      definition,
      clearancePoints,
      minHeight,
      maxHeight,
      preferEdge,
      scaleRange,
      favorCorridorEdge,
    } = args;
    const half = definition.worldSize * 0.48;
    const spawnClear = definition.vegetation.minimumSpawnClearance;
    const out: PlacementInstance[] = [];
    const maxAttempts = count * 18;

    for (let attempt = 0; attempt < maxAttempts && out.length < count; attempt++) {
      let x = rng.range(-half, half);
      let z = rng.range(-half, half);

      if (preferEdge) {
        // Bias toward valley edges (away from center).
        const angle = rng.range(0, Math.PI * 2);
        const radius = rng.range(half * 0.22, half * 0.92);
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
      } else if (favorCorridorEdge) {
        const angle = rng.range(0, Math.PI * 2);
        const radius = rng.range(half * 0.08, half * 0.28);
        x = Math.cos(angle) * radius + rng.range(-20, 20);
        z = Math.sin(angle) * radius + rng.range(-40, 10);
      }

      if (!this.withinWorld(x, z, definition.worldSize)) {
        continue;
      }
      if (this.hitsClearance(x, z, clearancePoints, 0)) {
        continue;
      }
      if (
        Math.hypot(x - definition.spawnPosition.x, z - definition.spawnPosition.z) <
        spawnClear
      ) {
        continue;
      }

      const y = terrainHeightAt(x, z, grid);
      if (y < minHeight || y > maxHeight) {
        continue;
      }

      // Reject overly steep samples via neighbor delta.
      const dy =
        Math.abs(terrainHeightAt(x + 2, z, grid) - y) +
        Math.abs(terrainHeightAt(x, z + 2, grid) - y);
      if (dy > args.maxSlopeProxy) {
        continue;
      }

      // Density falloff: fewer plants deep in mountains.
      const radial = Math.hypot(x, z) / (definition.worldSize * 0.5);
      if (
        radial > 0.75 &&
        rng.next() < definition.vegetation.densityFalloff * 0.65
      ) {
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

  private placeRocks(
    count: number,
    rng: SeededRandom,
    grid: BuiltTerrainGrid,
    definition: EnvironmentDefinition,
    clearancePoints: ClearancePoint[],
  ): PlacementInstance[] {
    const out: PlacementInstance[] = [];
    const half = definition.worldSize * 0.45;
    const maxAttempts = count * 16;

    for (let i = 0; i < maxAttempts && out.length < count; i++) {
      const angle = rng.range(0, Math.PI * 2);
      // Cluster a few near the course left side for the "rocks turn".
      const nearCourse = rng.next() < 0.35;
      let x: number;
      let z: number;
      if (nearCourse) {
        x = rng.range(-28, -8);
        z = rng.range(-48, -28);
      } else {
        const radius = rng.range(half * 0.2, half * 0.9);
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
      }

      if (this.hitsClearance(x, z, clearancePoints, 1.5)) {
        continue;
      }
      const y = terrainHeightAt(x, z, grid);
      if (y > 30) {
        continue;
      }
      out.push({
        x,
        y,
        z,
        scale: rng.range(0.6, 2.2),
        rotationY: rng.range(0, Math.PI * 2),
        variant: rng.int(0, 2),
      });
    }
    return out;
  }

  /** Deterministic alpine scatter rocks away from the course corridor. */
  private placeAlpineScatterRocks(
    out: PlacementInstance[],
    rng: SeededRandom,
    grid: BuiltTerrainGrid,
    definition: EnvironmentDefinition,
    clearancePoints: ClearancePoint[],
  ): void {
    const slots: Array<{ x: number; z: number; scale: number; variant: number }> =
      [
        { x: -52, z: -36, scale: 1.2, variant: 0 },
        { x: -48, z: -52, scale: 0.95, variant: 1 },
        { x: 58, z: -44, scale: 1.35, variant: 2 },
        { x: 62, z: -68, scale: 1.05, variant: 0 },
        { x: -60, z: -96, scale: 1.15, variant: 1 },
      ];
    for (const slot of slots) {
      if (this.hitsClearance(slot.x, slot.z, clearancePoints, 2)) {
        continue;
      }
      if (!this.withinWorld(slot.x, slot.z, definition.worldSize)) {
        continue;
      }
      out.push({
        x: slot.x + rng.range(-0.6, 0.6),
        y: terrainHeightAt(slot.x, slot.z, grid),
        z: slot.z + rng.range(-0.6, 0.6),
        scale: slot.scale,
        rotationY: rng.range(0, Math.PI * 2),
        variant: slot.variant,
      });
    }
  }

  /** Low fence-like barrier segments along the alpine valley rim. */
  private placeAlpineFenceBarriers(
    out: PlacementInstance[],
    rng: SeededRandom,
    grid: BuiltTerrainGrid,
    definition: EnvironmentDefinition,
    clearancePoints: ClearancePoint[],
  ): void {
    const half = definition.worldSize * 0.46;
    const fenceAngles = [-0.95, -0.75, 0.55, 0.72];
    for (const baseAngle of fenceAngles) {
      const angle = baseAngle + rng.range(-0.04, 0.04);
      const x = Math.cos(angle) * half;
      const z = Math.sin(angle) * half * 0.55 - 20;
      if (this.hitsClearance(x, z, clearancePoints, 2.5)) {
        continue;
      }
      out.push({
        x,
        y: terrainHeightAt(x, z, grid),
        z,
        scale: rng.range(0.85, 1.05),
        rotationY: angle + Math.PI / 2,
        variant: 1,
      });
    }
  }

  private placeFlags(
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

    // Prefer turns / elevated gate indices.
    const preferred = [2, 3, 4, 5, 6, 7].filter((i) => i < gates.length);
    const targets =
      preferred.length > 0
        ? preferred
        : gates.map((_, i) => i).slice(0, Math.min(count, gates.length));

    for (let i = 0; i < Math.min(count, targets.length); i++) {
      const gate = gates[targets[i]!]!;
      const side = i % 2 === 0 ? 1 : -1;
      const offset = gate.width * 0.5 + 1.8 + rng.range(0, 0.8);
      // Offset roughly sideways in XZ using yaw-ish approximation from gate order.
      const x = gate.position.x + side * offset * 0.85;
      const z = gate.position.z + rng.range(-1.2, 1.2);
      const y = terrainHeightAt(x, z, grid);
      out.push({
        x,
        y,
        z,
        scale: rng.range(0.9, 1.15),
        rotationY: rng.range(-0.2, 0.2),
        variant: i % 3,
      });
    }
    return out;
  }

  private placeBarriers(
    count: number,
    rng: SeededRandom,
    grid: BuiltTerrainGrid,
    definition: EnvironmentDefinition,
    clearancePoints: ClearancePoint[],
  ): PlacementInstance[] {
    const out: PlacementInstance[] = [];
    const half = definition.worldSize * 0.42;
    for (let i = 0; i < count * 10 && out.length < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const radius = half * 0.95;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (this.hitsClearance(x, z, clearancePoints, 2)) {
        continue;
      }
      out.push({
        x,
        y: terrainHeightAt(x, z, grid),
        z,
        scale: 1,
        rotationY: angle + Math.PI / 2,
        variant: 0,
      });
    }
    return out;
  }

  private placeCabin(
    rng: SeededRandom,
    grid: BuiltTerrainGrid,
    definition: EnvironmentDefinition,
    clearancePoints: ClearancePoint[],
  ): LandmarkPlacement {
    // Right-hand side of course near the cabin turn.
    const candidates: Array<[number, number]> = [
      [22, -88],
      [26, -92],
      [20, -80],
      [28, -96],
    ];
    for (const [cx, cz] of candidates) {
      if (this.hitsClearance(cx, cz, clearancePoints, 4)) {
        continue;
      }
      return {
        x: cx + rng.range(-1, 1),
        y: terrainHeightAt(cx, cz, grid),
        z: cz + rng.range(-1, 1),
        yaw: -Math.PI / 5,
        scale: 1,
      };
    }
    const x = 24;
    const z = -90;
    return {
      x,
      y: terrainHeightAt(x, z, grid),
      z,
      yaw: 0,
      scale: 1,
    };
  }

  private placeRadioTower(
    rng: SeededRandom,
    grid: BuiltTerrainGrid,
    definition: EnvironmentDefinition,
  ): LandmarkPlacement {
    const angle = -Math.PI * 0.65 + rng.range(-0.05, 0.05);
    const radius = definition.worldSize * 0.38;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    return {
      x,
      y: terrainHeightAt(x, z, grid),
      z,
      yaw: 0,
      scale: 1,
    };
  }

  private hitsClearance(
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

  private withinWorld(x: number, z: number, worldSize: number): boolean {
    const half = worldSize * 0.5 - 4;
    return Math.abs(x) <= half && Math.abs(z) <= half;
  }

  private assertFiniteHeights(grid: BuiltTerrainGrid): void {
    for (let i = 0; i < grid.heights.length; i++) {
      const h = grid.heights[i]!;
      if (!Number.isFinite(h)) {
        throw new Error('Non-finite terrain height');
      }
    }
  }

  /** Expose sampling for tests / optional future collision. */
  sampleHeight(
    x: number,
    z: number,
    definition: EnvironmentDefinition = ALPINE_TRAINING_VALLEY,
    course?: Course,
  ): number {
    const flattenZones = course
      ? this.buildClearancePoints(course, definition).map(
          (c): FlattenZone => ({
            x: c.x,
            z: c.z,
            radius: c.radius,
            targetHeight: 0,
          }),
        )
      : [];
    return sampleTerrainHeight(x, z, {
      settings: definition.terrain,
      seed: definition.seed,
      flattenZones,
      corridorRadius: definition.worldSize * 0.12,
    });
  }
}
