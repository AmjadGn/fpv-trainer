import { mixSeed } from './seeded-random';
import type { TerrainSettings } from '../models/environment.model';

export interface FlattenZone {
  x: number;
  z: number;
  radius: number;
  /** Target height; default 0 for flight corridor. */
  targetHeight?: number;
}

export interface TerrainSampleOptions {
  settings: TerrainSettings;
  seed: number;
  flattenZones?: readonly FlattenZone[];
  /** Soften heights inside this radius from origin (course corridor). */
  corridorRadius?: number;
}

/** Fade 0 at edge → 1 at center (smoothstep). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hash2(ix: number, iz: number, seed: number): number {
  let h = mixSeed(seed, ix * 374761393 + iz * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Deterministic value noise in ~[0, 1]. */
export function valueNoise2D(
  x: number,
  z: number,
  seed: number,
): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = fade(x - x0);
  const fz = fade(z - z0);

  const n00 = hash2(x0, z0, seed);
  const n10 = hash2(x0 + 1, z0, seed);
  const n01 = hash2(x0, z0 + 1, seed);
  const n11 = hash2(x0 + 1, z0 + 1, seed);

  return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fz);
}

/** Fractal Brownian motion, roughly centered around 0. */
export function fbm2D(
  x: number,
  z: number,
  seed: number,
  octaves: number,
  roughness: number,
): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  const oct = Math.max(1, Math.min(8, Math.floor(octaves)));
  for (let i = 0; i < oct; i++) {
    sum += (valueNoise2D(x * freq, z * freq, seed + i * 1013) * 2 - 1) * amp;
    norm += amp;
    amp *= roughness;
    freq *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * Sample raw procedural height before flatten / corridor clamp.
 * Positive Y is up. Central valley stays low; edges rise into mountains.
 */
export function sampleRawTerrainHeight(
  x: number,
  z: number,
  options: TerrainSampleOptions,
): number {
  const t = options.settings;
  const seed = options.seed;

  const halfW = t.width * 0.5;
  const halfD = t.depth * 0.5;
  const nx = x / Math.max(halfW, 1);
  const nz = z / Math.max(halfD, 1);
  const radial = Math.sqrt(nx * nx + nz * nz);

  // Soft valley bowl — keep center open, raise edges.
  const valleyMask = smoothstep(t.valleyWidth * 0.55, 1.15, radial);
  const edgeMountains =
    Math.pow(Math.max(0, radial - 0.35), 1.55) * t.edgeMountainStrength;

  const freq = t.hillFrequency;
  const hills =
    fbm2D(x * freq, z * freq, seed, t.noiseOctaves, t.roughness) *
    t.hillAmplitude;

  // Slight secondary ridge noise for mountain silhouette variety.
  const ridges =
    fbm2D(x * freq * 0.35 + 20, z * freq * 0.35 - 11, seed + 77, 3, 0.5) *
    t.hillAmplitude *
    0.45 *
    valleyMask;

  let height =
    t.baseHeight -
    t.valleyDepth * (1 - valleyMask) * 0.15 +
    hills * (0.35 + valleyMask * 0.65) +
    edgeMountains +
    ridges;

  // Keep absolute extremes gentle — no impassable spikes.
  height = Math.max(-1.5, Math.min(height, t.edgeMountainStrength * 1.35));
  return height;
}

/** Apply flatten discs with smooth falloff toward target height. */
export function applyFlattenZones(
  height: number,
  x: number,
  z: number,
  zones: readonly FlattenZone[] | undefined,
): number {
  if (!zones || zones.length === 0) {
    return height;
  }
  let h = height;
  for (const zone of zones) {
    const dx = x - zone.x;
    const dz = z - zone.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= zone.radius) {
      continue;
    }
    const influence = 1 - smoothstep(0, zone.radius, dist);
    const target = zone.targetHeight ?? 0;
    h = lerp(h, target, influence * influence);
  }
  return h;
}

/**
 * Softly clamp heights near the origin so the flight corridor stays near y = 0
 * for visual/physics compatibility (authoritative collision remains y = 0).
 */
export function applyCorridorClamp(
  height: number,
  x: number,
  z: number,
  corridorRadius: number,
): number {
  const dist = Math.sqrt(x * x + z * z);
  if (dist >= corridorRadius) {
    return height;
  }
  const influence = 1 - smoothstep(corridorRadius * 0.35, corridorRadius, dist);
  // Pull toward near-zero; allow tiny undulation so the floor isn't a perfect plane.
  const softTarget = height * 0.08;
  return lerp(height, softTarget, influence * 0.92);
}

export function sampleTerrainHeight(
  x: number,
  z: number,
  options: TerrainSampleOptions,
): number {
  let h = sampleRawTerrainHeight(x, z, options);
  h = applyFlattenZones(h, x, z, options.flattenZones);
  const corridor = options.corridorRadius ?? options.settings.valleyWidth * 0.42;
  h = applyCorridorClamp(h, x, z, corridor);
  return h;
}

export interface TerrainColorInput {
  height: number;
  slope: number;
  noise: number;
}

function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/**
 * Natural, desaturated terrain colors from height + slope + noise.
 * Alpine-like bands blend smoothly; steep slopes expose earth/rock.
 * Returns [r, g, b] in 0..1.
 */
export function terrainVertexColor(input: TerrainColorInput): [number, number, number] {
  const { height, slope, noise } = input;
  const n = (noise - 0.5) * 0.08;
  const nFine = (noise - 0.5) * 0.04;

  const valleyGrass: [number, number, number] = [
    0.32 + n,
    0.48 + n * 0.8,
    0.28 + n * 0.5,
  ];
  const meadowGrass: [number, number, number] = [
    0.28 + nFine,
    0.44 + n * 0.72,
    0.26 + n * 0.42,
  ];
  const hillGrass: [number, number, number] = [
    0.26 + nFine,
    0.38 + n * 0.65,
    0.22 + n * 0.38,
  ];
  const alpineEarth: [number, number, number] = [
    0.4 + n * 0.6,
    0.33 + n * 0.45,
    0.25 + n * 0.28,
  ];
  const screeRock: [number, number, number] = [
    0.46 + n * 0.45,
    0.44 + n * 0.42,
    0.4 + n * 0.35,
  ];
  const bareRock: [number, number, number] = [
    0.5 + n * 0.35,
    0.49 + n * 0.32,
    0.47 + n * 0.28,
  ];
  const snowCap: [number, number, number] = [
    0.72 + n * 0.2,
    0.74 + n * 0.2,
    0.76 + n * 0.15,
  ];

  // Height-driven alpine palette (smooth bands, no hard seams).
  let rgb = valleyGrass;
  rgb = lerpColor(rgb, meadowGrass, smoothstep(1.5, 4.5, height));
  rgb = lerpColor(rgb, hillGrass, smoothstep(6, 14, height));
  rgb = lerpColor(rgb, alpineEarth, smoothstep(12, 24, height));
  rgb = lerpColor(rgb, screeRock, smoothstep(22, 34, height));
  rgb = lerpColor(rgb, bareRock, smoothstep(30, 42, height));
  rgb = lerpColor(rgb, snowCap, smoothstep(38, 52, height));

  // Steep slopes → strip grass, expose scree/rock (stronger at mid elevations).
  const slopeRock = smoothstep(0.28, 0.82, slope);
  const midElev = smoothstep(8, 36, height) * smoothstep(48, 28, height);
  const slopeTarget = lerpColor(alpineEarth, bareRock, midElev * 0.65 + 0.2);
  rgb = lerpColor(rgb, slopeTarget, slopeRock * (0.55 + midElev * 0.35));

  // Subtle noise-driven patchiness on gentler slopes.
  const patch = (noise - 0.5) * smoothstep(0.5, 0.15, slope) * 0.04;
  rgb = [rgb[0] + patch, rgb[1] + patch * 0.85, rgb[2] + patch * 0.55];

  return [
    Math.min(1, Math.max(0, rgb[0])),
    Math.min(1, Math.max(0, rgb[1])),
    Math.min(1, Math.max(0, rgb[2])),
  ];
}

export interface BuiltTerrainGrid {
  heights: Float32Array;
  colors: Float32Array;
  segmentsX: number;
  segmentsZ: number;
  width: number;
  depth: number;
}

/**
 * Build a full height + color grid for PlaneGeometry (segmentsX+1)×(segmentsZ+1).
 * Plane lies in XZ after rotating -PI/2 around X (Y up).
 */
export function buildTerrainGrid(
  options: TerrainSampleOptions,
  segmentsX: number,
  segmentsZ: number,
): BuiltTerrainGrid {
  const { width, depth } = options.settings;
  const vertsX = segmentsX + 1;
  const vertsZ = segmentsZ + 1;
  const heights = new Float32Array(vertsX * vertsZ);
  const colors = new Float32Array(vertsX * vertsZ * 3);
  const colorSeed = mixSeed(options.seed, 0x7e11a1);

  for (let iz = 0; iz < vertsZ; iz++) {
    const vz = (iz / segmentsZ - 0.5) * depth;
    for (let ix = 0; ix < vertsX; ix++) {
      const vx = (ix / segmentsX - 0.5) * width;
      const idx = iz * vertsX + ix;
      const h = sampleTerrainHeight(vx, vz, options);
      heights[idx] = h;

      // Approximate slope from neighbors (central differences where possible).
      const stepX = width / segmentsX;
      const stepZ = depth / segmentsZ;
      const hx1 = sampleTerrainHeight(vx + stepX, vz, options);
      const hz1 = sampleTerrainHeight(vx, vz + stepZ, options);
      const slope = Math.min(
        1,
        Math.sqrt(
          Math.pow((hx1 - h) / stepX, 2) + Math.pow((hz1 - h) / stepZ, 2),
        ) * 0.55,
      );

      const noise = valueNoise2D(vx * 0.08, vz * 0.08, colorSeed);
      const [r, g, b] = terrainVertexColor({ height: h, slope, noise });
      const ci = idx * 3;
      colors[ci] = r;
      colors[ci + 1] = g;
      colors[ci + 2] = b;
    }
  }

  return {
    heights,
    colors,
    segmentsX,
    segmentsZ,
    width,
    depth,
  };
}

/**
 * Bilinear sample of a built height grid at world XZ.
 * Used for vegetation Y placement; physics still uses y = 0.
 */
export function terrainHeightAt(
  x: number,
  z: number,
  grid: BuiltTerrainGrid,
): number {
  const { width, depth, segmentsX, segmentsZ, heights } = grid;
  const u = (x / width + 0.5) * segmentsX;
  const v = (z / depth + 0.5) * segmentsZ;
  const vertsX = segmentsX + 1;

  const x0 = Math.floor(u);
  const z0 = Math.floor(v);
  const x1 = Math.min(segmentsX, x0 + 1);
  const z1 = Math.min(segmentsZ, z0 + 1);
  const clampedX0 = Math.min(segmentsX, Math.max(0, x0));
  const clampedZ0 = Math.min(segmentsZ, Math.max(0, z0));

  const tx = Math.min(1, Math.max(0, u - clampedX0));
  const tz = Math.min(1, Math.max(0, v - clampedZ0));

  const h00 = heights[clampedZ0 * vertsX + clampedX0] ?? 0;
  const h10 = heights[clampedZ0 * vertsX + x1] ?? 0;
  const h01 = heights[z1 * vertsX + clampedX0] ?? 0;
  const h11 = heights[z1 * vertsX + x1] ?? 0;

  return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
}

export function createFallbackFlatGrid(
  width: number,
  depth: number,
  segments: number,
): BuiltTerrainGrid {
  const verts = (segments + 1) * (segments + 1);
  const heights = new Float32Array(verts);
  const colors = new Float32Array(verts * 3);
  for (let i = 0; i < verts; i++) {
    heights[i] = 0;
    colors[i * 3] = 0.34;
    colors[i * 3 + 1] = 0.48;
    colors[i * 3 + 2] = 0.3;
  }
  return {
    heights,
    colors,
    segmentsX: segments,
    segmentsZ: segments,
    width,
    depth,
  };
}
