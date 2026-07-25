import type { GeneratedEnvironment, PlacementInstance, LandmarkPlacement } from '../models/environment.model';
import type { Course, CourseGate } from '../../course/models/course.model';
import {
  CollisionGroup,
  DYNAMIC_PROP_COLLIDES_WITH,
  STATIC_COLLIDES_WITH,
  TERRAIN_COLLIDES_WITH,
} from '../../physics/models/collision-groups';
import type {
  EnvironmentColliderDefinition,
  CollisionMaterialId,
} from '../../physics/models/collision.models';
import { COLLIDER_MANIFEST_VERSION } from '../../physics/config/physics-versions';
import type { Quat, Vec3 } from '../../flight/models/flight-state.model';

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

function yawQuat(yaw: number): { x: number; y: number; z: number; w: number } {
  const h = yaw * 0.5;
  return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}

function rotateOffsetByQuat(ox: number, oy: number, oz: number, q: Quat): Vec3 {
  const tx = 2 * (q.y * oz - q.z * oy);
  const ty = 2 * (q.z * ox - q.x * oz);
  const tz = 2 * (q.x * oy - q.y * ox);
  return {
    x: ox + q.w * tx + (q.y * tz - q.z * ty),
    y: oy + q.w * ty + (q.z * tx - q.x * tz),
    z: oz + q.w * tz + (q.x * ty - q.y * tx),
  };
}

function boxDef(options: {
  id: string;
  objectId: string;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  yaw?: number;
  material: CollisionMaterialId;
  bodyType?: 'fixed' | 'dynamic';
  critical?: boolean;
  dynamic?: EnvironmentColliderDefinition['dynamicProperties'];
}): EnvironmentColliderDefinition {
  const dynamic = options.bodyType === 'dynamic';
  return {
    id: options.id,
    objectId: options.objectId,
    bodyType: options.bodyType ?? 'fixed',
    shape: {
      kind: 'box',
      halfExtents: { x: options.hx, y: options.hy, z: options.hz },
    },
    position: { x: options.x, y: options.y, z: options.z },
    rotation: yawQuat(options.yaw ?? 0),
    material: options.material,
    collisionGroup: dynamic
      ? CollisionGroup.DYNAMIC_PROP
      : CollisionGroup.STATIC_STRUCTURE,
    collidesWith: dynamic ? DYNAMIC_PROP_COLLIDES_WITH : STATIC_COLLIDES_WITH,
    collisionCritical: options.critical ?? true,
    damageMultiplier: 1,
    dynamicProperties: options.dynamic ?? null,
  };
}

/**
 * Build collider manifests from generated environment data.
 * Prefer primitives; competitive layout is quality-invariant for critical objects.
 */
export function buildEnvironmentColliderManifest(
  env: GeneratedEnvironment,
  options?: { allowDynamicProps?: boolean; quality?: string; course?: Course | null },
): {
  version: string;
  colliders: EnvironmentColliderDefinition[];
} {
  const allowDynamic = options?.allowDynamicProps !== false;
  const colliders: EnvironmentColliderDefinition[] = [];

  // Ground contact stays on FlightController legacy plane (y≈0).
  // Rapier handles structures + props only — avoids phantom climb from soft-landing.

  if (options?.course?.gates?.length) {
    colliders.push(...buildGateFrameColliders(options.course.gates));
  }

  // Alpine / shared props
  for (const rock of env.rocks) {
    if (rock.scale < 0.7) {
      continue; // decorative pebbles — no collision
    }
    const r = 0.35 * rock.scale;
    colliders.push({
      id: `rock-${rock.x.toFixed(2)}-${rock.z.toFixed(2)}`,
      objectId: 'rock',
      bodyType: 'fixed',
      shape: {
        kind: 'sphere',
        radius: r,
        translation: { x: 0, y: r * 0.6, z: 0 },
      },
      position: { x: rock.x, y: rock.y, z: rock.z },
      rotation: yawQuat(rock.rotationY),
      material: 'rock',
      collisionGroup: CollisionGroup.STATIC_STRUCTURE,
      collidesWith: STATIC_COLLIDES_WITH,
      collisionCritical: rock.scale >= 1.2,
      enabledByQuality: rock.scale >= 1 ? 'all' : 'medium',
    });
  }

  // Trees: trunk capsule + canopy sphere (visual cone ≈ triangle silhouette).
  for (let i = 0; i < env.trees.length; i++) {
    const t = env.trees[i]!;
    if (t.scale < 0.45) {
      continue;
    }
    const trunkH = 1.2 * t.scale;
    const trunkR = Math.max(0.08, 0.16 * t.scale);
    const canopyR = Math.max(0.35, 0.75 * t.scale);
    const idBase = `tree-${t.x.toFixed(1)}-${t.z.toFixed(1)}-${i}`;
    colliders.push({
      id: `${idBase}-trunk`,
      objectId: 'tree',
      bodyType: 'fixed',
      shape: {
        kind: 'capsule',
        radius: trunkR,
        halfHeight: Math.max(0.15, trunkH * 0.5 - trunkR),
      },
      position: { x: t.x, y: t.y + trunkH * 0.5, z: t.z },
      rotation: IDENTITY,
      material: 'wood',
      collisionGroup: CollisionGroup.STATIC_STRUCTURE,
      collidesWith: STATIC_COLLIDES_WITH,
      collisionCritical: true,
      damageMultiplier: 0.85,
    });
    colliders.push({
      id: `${idBase}-canopy`,
      objectId: 'tree',
      bodyType: 'fixed',
      shape: {
        kind: 'sphere',
        radius: canopyR,
      },
      position: {
        x: t.x,
        y: t.y + trunkH + 0.55 * t.scale,
        z: t.z,
      },
      rotation: IDENTITY,
      material: 'wood',
      collisionGroup: CollisionGroup.STATIC_STRUCTURE,
      collidesWith: STATIC_COLLIDES_WITH,
      collisionCritical: true,
      damageMultiplier: 0.7,
      enabledByQuality: 'medium',
    });
  }

  // Larger bushes — soft vegetation hit (still solid enough to deflect).
  for (let i = 0; i < env.bushes.length; i++) {
    const b = env.bushes[i]!;
    if (b.scale < 0.7) {
      continue;
    }
    colliders.push({
      id: `bush-${b.x.toFixed(1)}-${b.z.toFixed(1)}-${i}`,
      objectId: 'bush',
      bodyType: 'fixed',
      shape: {
        kind: 'sphere',
        radius: 0.5 * b.scale,
      },
      position: { x: b.x, y: b.y + 0.35 * b.scale, z: b.z },
      rotation: IDENTITY,
      material: 'grass',
      collisionGroup: CollisionGroup.STATIC_STRUCTURE,
      collidesWith: STATIC_COLLIDES_WITH,
      collisionCritical: false,
      damageMultiplier: 0.35,
      enabledByQuality: 'high',
    });
  }

  for (const b of env.barriers) {
    colliders.push(
      boxDef({
        id: `barrier-${b.x.toFixed(1)}-${b.z.toFixed(1)}`,
        objectId: 'barrier',
        x: b.x,
        y: b.y + 0.5 * b.scale,
        z: b.z,
        // Slightly oversized vs visual mesh for reliable hits.
        hx: 0.7 * b.scale,
        hy: 0.55 * b.scale,
        hz: 0.22 * b.scale,
        yaw: b.rotationY,
        material: 'concrete',
        critical: true,
      }),
    );
  }

  // Flag poles (thin columns along the course).
  for (let i = 0; i < env.flags.length; i++) {
    const f = env.flags[i]!;
    const s = Math.max(0.6, f.scale);
    colliders.push({
      id: `flag-pole-${f.x.toFixed(1)}-${f.z.toFixed(1)}-${i}`,
      objectId: 'flagPole',
      bodyType: 'fixed',
      shape: {
        kind: 'cylinder',
        radius: 0.07 * s,
        halfHeight: 1.2 * s,
      },
      position: { x: f.x, y: f.y + 1.2 * s, z: f.z },
      rotation: IDENTITY,
      material: 'metal',
      collisionGroup: CollisionGroup.STATIC_STRUCTURE,
      collidesWith: STATIC_COLLIDES_WITH,
      collisionCritical: true,
      damageMultiplier: 0.9,
    });
  }

  // Start pad / landing marking as a low box when present.
  if (env.startPad) {
    const p = env.startPad;
    colliders.push(
      boxDef({
        id: 'start-pad',
        objectId: 'startPad',
        x: p.x,
        y: p.y + 0.06 * p.scale,
        z: p.z,
        hx: 1.4 * p.scale,
        hy: 0.06 * p.scale,
        hz: 1.4 * p.scale,
        yaw: p.yaw,
        material: 'concrete',
        critical: false,
      }),
    );
  }

  if (env.cabin) {
    colliders.push(...buildCabinColliders(env.cabin));
  }
  if (env.radioTower) {
    colliders.push(
      boxDef({
        id: 'radio-tower-base',
        objectId: 'radioTower',
        x: env.radioTower.x,
        y: env.radioTower.y + 0.4,
        z: env.radioTower.z,
        hx: 0.6 * env.radioTower.scale,
        hy: 0.4 * env.radioTower.scale,
        hz: 0.6 * env.radioTower.scale,
        yaw: env.radioTower.yaw,
        material: 'metal',
        critical: true,
      }),
      boxDef({
        id: 'radio-tower-mast',
        objectId: 'radioTower',
        x: env.radioTower.x,
        y: env.radioTower.y + 4 * env.radioTower.scale,
        z: env.radioTower.z,
        hx: 0.12 * env.radioTower.scale,
        hy: 4 * env.radioTower.scale,
        hz: 0.12 * env.radioTower.scale,
        yaw: env.radioTower.yaw,
        material: 'metal',
        critical: true,
      }),
    );
  }

  if (env.industrial) {
    colliders.push(...buildIndustrialColliders(env.industrial, allowDynamic));
  }
  if (env.coastal) {
    colliders.push(...buildCoastalColliders(env.coastal, allowDynamic));
  }

  if (allowDynamic && env.theme === 'desert-industrial') {
    colliders.push(...buildDesertDynamicProps(env));
  }
  if (allowDynamic && env.theme === 'alpine') {
    colliders.push(...buildAlpineDynamicProps(env));
  }
  if (allowDynamic && env.theme === 'coastal') {
    colliders.push(...buildCoastalDynamicProps(env));
  }

  return { version: COLLIDER_MANIFEST_VERSION, colliders };
}

/**
 * Gate frame solids matching renderer createGate(): left/right uprights + top/bottom
 * bars. Opening stays empty so race plane-crossing still works.
 */
export function buildGateFrameColliders(
  gates: readonly CourseGate[],
): EnvironmentColliderDefinition[] {
  const out: EnvironmentColliderDefinition[] = [];
  const thickness = 0.22; // slightly thicker than visual 0.18 for reliable hits
  for (const gate of gates) {
    const halfW = gate.width * 0.5;
    const halfH = gate.height * 0.5;
    const depth = Math.max(0.25, gate.depth);
    const q = gate.rotation;
    const parts: Array<{
      id: string;
      ox: number;
      oy: number;
      oz: number;
      hx: number;
      hy: number;
      hz: number;
    }> = [
      {
        id: 'left',
        ox: -halfW - thickness * 0.5,
        oy: 0,
        oz: 0,
        hx: thickness * 0.5,
        hy: halfH + thickness,
        hz: depth * 0.5,
      },
      {
        id: 'right',
        ox: halfW + thickness * 0.5,
        oy: 0,
        oz: 0,
        hx: thickness * 0.5,
        hy: halfH + thickness,
        hz: depth * 0.5,
      },
      {
        id: 'top',
        ox: 0,
        oy: halfH + thickness * 0.5,
        oz: 0,
        hx: halfW + thickness,
        hy: thickness * 0.5,
        hz: depth * 0.5,
      },
      {
        id: 'bottom',
        ox: 0,
        oy: -halfH - thickness * 0.5,
        oz: 0,
        hx: halfW + thickness,
        hy: thickness * 0.5,
        hz: depth * 0.5,
      },
    ];

    // Ground support posts under the uprights.
    const postH = Math.max(0.5, gate.position.y - halfH);
    if (postH > 0.2) {
      parts.push(
        {
          id: 'post-l',
          ox: -halfW,
          oy: -gate.position.y + postH * 0.5,
          oz: 0,
          hx: 0.12,
          hy: postH * 0.5,
          hz: 0.12,
        },
        {
          id: 'post-r',
          ox: halfW,
          oy: -gate.position.y + postH * 0.5,
          oz: 0,
          hx: 0.12,
          hy: postH * 0.5,
          hz: 0.12,
        },
      );
    }

    for (const part of parts) {
      const world = rotateOffsetByQuat(part.ox, part.oy, part.oz, q);
      out.push({
        id: `gate-${gate.index}-${part.id}`,
        objectId: 'gateFrame',
        bodyType: 'fixed',
        shape: {
          kind: 'box',
          halfExtents: { x: part.hx, y: part.hy, z: part.hz },
        },
        position: {
          x: gate.position.x + world.x,
          y: gate.position.y + world.y,
          z: gate.position.z + world.z,
        },
        rotation: { ...q },
        material: 'metal',
        collisionGroup: CollisionGroup.STATIC_STRUCTURE,
        collidesWith: STATIC_COLLIDES_WITH,
        collisionCritical: true,
        damageMultiplier: 1.1,
      });
    }
  }
  return out;
}

/**
 * Optional ground collider. Prefer legacy FlightController ground (y≈0) for
 * corridor contact so Rapier does not fight thrust with soft-landing zeroing.
 * Kept for debug / future heightfield work; not added to the default manifest.
 */
export function buildTerrainCollider(
  env: GeneratedEnvironment,
): EnvironmentColliderDefinition {
  /**
   * Flat ground plane matching the flyable corridor (heights flattened to ~0).
   * A full Rapier heightfield previously generated phantom contacts that zeroed
   * downward velocity every frame while thrust continued → uncontrolled climb.
   * Hills remain visual; structure colliders handle solid world objects.
   */
  const half = Math.max(50, env.worldSize * 0.5);
  return {
    id: 'terrain-ground',
    objectId: 'terrain',
    bodyType: 'fixed',
    shape: {
      kind: 'box',
      halfExtents: { x: half, y: 0.05, z: half },
      translation: { x: 0, y: -0.05, z: 0 },
    },
    position: { x: 0, y: 0, z: 0 },
    rotation: IDENTITY,
    material:
      env.theme === 'desert-industrial'
        ? 'dirt'
        : env.theme === 'coastal'
          ? 'rock'
          : 'grass',
    collisionGroup: CollisionGroup.TERRAIN,
    collidesWith: TERRAIN_COLLIDES_WITH,
    collisionCritical: true,
    damageMultiplier: 1,
  };
}

function buildCabinColliders(
  cabin: LandmarkPlacement,
): EnvironmentColliderDefinition[] {
  const s = cabin.scale;
  return [
    boxDef({
      id: 'cabin-walls',
      objectId: 'cabin',
      x: cabin.x,
      y: cabin.y + 1.1 * s,
      z: cabin.z,
      hx: 2.2 * s,
      hy: 1.1 * s,
      hz: 1.6 * s,
      yaw: cabin.yaw,
      material: 'wood',
      critical: true,
    }),
    // Roof as slightly larger box
    boxDef({
      id: 'cabin-roof',
      objectId: 'cabin',
      x: cabin.x,
      y: cabin.y + 2.5 * s,
      z: cabin.z,
      hx: 2.4 * s,
      hy: 0.35 * s,
      hz: 1.8 * s,
      yaw: cabin.yaw,
      material: 'wood',
      critical: true,
    }),
  ];
}

function buildIndustrialColliders(
  industrial: NonNullable<GeneratedEnvironment['industrial']>,
  allowDynamic: boolean,
): EnvironmentColliderDefinition[] {
  const out: EnvironmentColliderDefinition[] = [];

  for (const c of industrial.containers) {
    out.push(
      boxDef({
        id: `container-${c.x.toFixed(1)}-${c.z.toFixed(1)}-${c.y.toFixed(1)}`,
        objectId: 'container',
        x: c.x,
        y: c.y + 1.3 * c.scale,
        z: c.z,
        hx: 1.2 * c.scale,
        hy: 1.3 * c.scale,
        hz: 2.6 * c.scale,
        yaw: c.rotationY,
        material: 'metal',
        critical: true,
      }),
    );
  }

  for (const w of industrial.warehouses) {
    // Hollow hangar: side walls + back, leave front opening.
    const s = w.scale;
    const yaw = w.yaw;
    const cx = w.x;
    const cy = w.y;
    const cz = w.z;
    const wallH = 4 * s;
    const depth = 8 * s;
    const width = 10 * s;
    out.push(
      boxDef({
        id: `wh-left-${cx.toFixed(0)}`,
        objectId: 'warehouse',
        x: cx - width * 0.45,
        y: cy + wallH * 0.5,
        z: cz,
        hx: 0.25 * s,
        hy: wallH * 0.5,
        hz: depth * 0.5,
        yaw,
        material: 'metal',
        critical: true,
      }),
      boxDef({
        id: `wh-right-${cx.toFixed(0)}`,
        objectId: 'warehouse',
        x: cx + width * 0.45,
        y: cy + wallH * 0.5,
        z: cz,
        hx: 0.25 * s,
        hy: wallH * 0.5,
        hz: depth * 0.5,
        yaw,
        material: 'metal',
        critical: true,
      }),
      boxDef({
        id: `wh-back-${cx.toFixed(0)}`,
        objectId: 'warehouse',
        x: cx,
        y: cy + wallH * 0.5,
        z: cz + depth * 0.45,
        hx: width * 0.5,
        hy: wallH * 0.5,
        hz: 0.25 * s,
        yaw,
        material: 'metal',
        critical: true,
      }),
      // Roof
      boxDef({
        id: `wh-roof-${cx.toFixed(0)}`,
        objectId: 'warehouse',
        x: cx,
        y: cy + wallH + 0.2 * s,
        z: cz,
        hx: width * 0.52,
        hy: 0.2 * s,
        hz: depth * 0.52,
        yaw,
        material: 'metal',
        critical: true,
      }),
    );
  }

  for (const p of industrial.pipes) {
    const elevated = p.variant === 1;
    // Box approximation keeps pipe tunnels / clearance predictable.
    out.push(
      boxDef({
        id: `pipe-${p.x.toFixed(1)}-${p.z.toFixed(1)}`,
        objectId: 'pipe',
        x: p.x,
        y: p.y + (elevated ? 3.2 * p.scale : 0.45 * p.scale),
        z: p.z,
        hx: elevated ? 0.4 * p.scale : 3.5 * p.scale,
        hy: 0.4 * p.scale,
        hz: elevated ? 3.5 * p.scale : 0.4 * p.scale,
        yaw: p.rotationY,
        material: 'metal',
        critical: true,
      }),
    );
  }

  if (industrial.crane) {
    const c = industrial.crane;
    out.push(
      boxDef({
        id: 'crane-base',
        objectId: 'crane',
        x: c.x,
        y: c.y + 1.5 * c.scale,
        z: c.z,
        hx: 1.2 * c.scale,
        hy: 1.5 * c.scale,
        hz: 1.2 * c.scale,
        yaw: c.yaw,
        material: 'metal',
        critical: true,
      }),
    );
  }

  for (const b of industrial.concreteBarriers) {
    out.push(
      boxDef({
        id: `cbarrier-${b.x.toFixed(1)}-${b.z.toFixed(1)}`,
        objectId: 'concreteBarrier',
        x: b.x,
        y: b.y + 0.4 * b.scale,
        z: b.z,
        hx: 0.7 * b.scale,
        hy: 0.4 * b.scale,
        hz: 0.2 * b.scale,
        yaw: b.rotationY,
        material: 'concrete',
        critical: true,
      }),
    );
  }

  for (let i = 0; i < industrial.utilityPoles.length; i++) {
    const p = industrial.utilityPoles[i]!;
    const s = Math.max(0.7, p.scale);
    out.push({
      id: `utility-pole-${p.x.toFixed(1)}-${p.z.toFixed(1)}-${i}`,
      objectId: 'utilityPole',
      bodyType: 'fixed',
      shape: {
        kind: 'cylinder',
        radius: 0.12 * s,
        halfHeight: 2.4 * s,
      },
      position: { x: p.x, y: p.y + 2.4 * s, z: p.z },
      rotation: IDENTITY,
      material: 'metal',
      collisionGroup: CollisionGroup.STATIC_STRUCTURE,
      collidesWith: STATIC_COLLIDES_WITH,
      collisionCritical: true,
      damageMultiplier: 1.05,
    });
  }

  if (allowDynamic) {
    // A few deterministic barrels / crates near origin corridor.
    const dynSpots: Array<{ x: number; z: number; kind: 'barrel' | 'crate' | 'cone' }> = [
      { x: 6, z: -4, kind: 'barrel' },
      { x: -5, z: 8, kind: 'crate' },
      { x: 10, z: 3, kind: 'cone' },
      { x: -8, z: -6, kind: 'crate' },
      { x: 4, z: 12, kind: 'barrel' },
    ];
    for (const spot of dynSpots) {
      out.push(makeDynamicProp(spot.kind, spot.x, 0, spot.z));
    }
  }

  return out;
}

function buildCoastalColliders(
  coastal: NonNullable<GeneratedEnvironment['coastal']>,
  allowDynamic: boolean,
): EnvironmentColliderDefinition[] {
  const out: EnvironmentColliderDefinition[] = [];

  for (const w of coastal.walls) {
    out.push(
      boxDef({
        id: `ruin-wall-${w.x.toFixed(1)}-${w.z.toFixed(1)}`,
        objectId: 'ruinWall',
        x: w.x,
        y: w.y + 1.4 * w.scale,
        z: w.z,
        hx: 2.2 * w.scale,
        hy: 1.4 * w.scale,
        hz: 0.35 * w.scale,
        yaw: w.rotationY,
        material: 'rock',
        critical: true,
      }),
    );
  }

  for (const a of coastal.arches) {
    // Compound arch: two pillars + top lintel (opening stays clear).
    const s = a.scale;
    out.push(
      boxDef({
        id: `arch-l-${a.x.toFixed(1)}`,
        objectId: 'arch',
        x: a.x - 1.4 * s,
        y: a.y + 1.6 * s,
        z: a.z,
        hx: 0.35 * s,
        hy: 1.6 * s,
        hz: 0.4 * s,
        yaw: a.yaw,
        material: 'rock',
        critical: true,
      }),
      boxDef({
        id: `arch-r-${a.x.toFixed(1)}`,
        objectId: 'arch',
        x: a.x + 1.4 * s,
        y: a.y + 1.6 * s,
        z: a.z,
        hx: 0.35 * s,
        hy: 1.6 * s,
        hz: 0.4 * s,
        yaw: a.yaw,
        material: 'rock',
        critical: true,
      }),
      boxDef({
        id: `arch-top-${a.x.toFixed(1)}`,
        objectId: 'arch',
        x: a.x,
        y: a.y + 3.4 * s,
        z: a.z,
        hx: 1.8 * s,
        hy: 0.35 * s,
        hz: 0.45 * s,
        yaw: a.yaw,
        material: 'rock',
        critical: true,
      }),
    );
  }

  for (const c of coastal.columns) {
    out.push({
      id: `column-${c.x.toFixed(1)}-${c.z.toFixed(1)}`,
      objectId: 'column',
      bodyType: 'fixed',
      shape: {
        kind: 'cylinder',
        radius: 0.35 * c.scale,
        halfHeight: 1.8 * c.scale,
      },
      position: { x: c.x, y: c.y + 1.8 * c.scale, z: c.z },
      rotation: yawQuat(c.rotationY),
      material: 'rock',
      collisionGroup: CollisionGroup.STATIC_STRUCTURE,
      collidesWith: STATIC_COLLIDES_WITH,
      collisionCritical: true,
    });
  }

  if (coastal.lighthouse) {
    const l = coastal.lighthouse;
    out.push({
      id: 'lighthouse-base',
      objectId: 'lighthouse',
      bodyType: 'fixed',
      shape: {
        kind: 'cylinder',
        radius: 1.4 * l.scale,
        halfHeight: 1.2 * l.scale,
      },
      position: { x: l.x, y: l.y + 1.2 * l.scale, z: l.z },
      rotation: IDENTITY,
      material: 'concrete',
      collisionGroup: CollisionGroup.STATIC_STRUCTURE,
      collidesWith: STATIC_COLLIDES_WITH,
      collisionCritical: true,
    });
  }

  if (coastal.oceanEnabled) {
    // Water sensor plane (not solid) — triggers water crash.
    out.push({
      id: 'ocean-water-sensor',
      objectId: 'water',
      bodyType: 'fixed',
      shape: {
        kind: 'box',
        halfExtents: {
          x: coastal.oceanSize * 0.5,
          y: 0.5,
          z: coastal.oceanSize * 0.5,
        },
      },
      position: {
        x: coastal.oceanCenter.x,
        y: coastal.oceanCenter.y - 0.4,
        z: coastal.oceanCenter.z,
      },
      rotation: IDENTITY,
      material: 'water',
      collisionGroup: CollisionGroup.WATER,
      collidesWith: CollisionGroup.DRONE,
      sensor: true,
      collisionCritical: true,
      damageMultiplier: 2,
    });
  }

  if (allowDynamic) {
    out.push(
      makeDynamicProp('crate', coastal.oceanCenter.x * 0.15, 0.3, -4),
      makeDynamicProp('barrel', -6, 0.4, 5),
    );
  }

  return out;
}

function buildAlpineDynamicProps(
  env: GeneratedEnvironment,
): EnvironmentColliderDefinition[] {
  const out: EnvironmentColliderDefinition[] = [];
  // Deterministic crates near cabin / start.
  if (env.cabin) {
    out.push(
      makeDynamicProp(
        'crate',
        env.cabin.x + 3.5,
        env.cabin.y + 0.35,
        env.cabin.z + 1.5,
      ),
      makeDynamicProp(
        'crate',
        env.cabin.x + 4.2,
        env.cabin.y + 0.35,
        env.cabin.z + 0.2,
        true,
      ),
    );
  }
  out.push(makeDynamicProp('crate', 3, 0.35, -2, true));
  return out;
}

function buildDesertDynamicProps(
  _env: GeneratedEnvironment,
): EnvironmentColliderDefinition[] {
  return []; // already added in industrial builder
}

function buildCoastalDynamicProps(
  _env: GeneratedEnvironment,
): EnvironmentColliderDefinition[] {
  return [];
}

function makeDynamicProp(
  kind: 'crate' | 'barrel' | 'cone' | 'box' | 'pallet',
  x: number,
  y: number,
  z: number,
  fragile = false,
): EnvironmentColliderDefinition {
  if (kind === 'barrel') {
    return {
      id: `dyn-barrel-${x.toFixed(1)}-${z.toFixed(1)}`,
      objectId: `dyn-barrel-${x.toFixed(1)}-${z.toFixed(1)}`,
      bodyType: 'dynamic',
      shape: { kind: 'cylinder', radius: 0.28, halfHeight: 0.42 },
      position: { x, y: y + 0.42, z },
      rotation: IDENTITY,
      material: 'metal',
      collisionGroup: CollisionGroup.DYNAMIC_PROP,
      collidesWith: DYNAMIC_PROP_COLLIDES_WITH,
      collisionCritical: false,
      dynamicProperties: {
        mass: 18,
        friction: 0.45,
        restitution: 0.15,
        linearDamping: 0.35,
        angularDamping: 0.4,
        breakThreshold: null,
        impactSoundCategory: 'metal',
        canSleep: true,
        propKind: 'metalBarrel',
      },
    };
  }
  if (kind === 'cone') {
    return {
      id: `dyn-cone-${x.toFixed(1)}-${z.toFixed(1)}`,
      objectId: `dyn-cone-${x.toFixed(1)}-${z.toFixed(1)}`,
      bodyType: 'dynamic',
      shape: { kind: 'cylinder', radius: 0.18, halfHeight: 0.28 },
      position: { x, y: y + 0.28, z },
      rotation: IDENTITY,
      material: 'plastic',
      collisionGroup: CollisionGroup.DYNAMIC_PROP,
      collidesWith: DYNAMIC_PROP_COLLIDES_WITH,
      collisionCritical: false,
      dynamicProperties: {
        mass: 1.2,
        friction: 0.4,
        restitution: 0.35,
        linearDamping: 0.5,
        angularDamping: 0.55,
        breakThreshold: null,
        impactSoundCategory: 'plastic',
        canSleep: true,
        propKind: 'trafficCone',
      },
    };
  }
  if (kind === 'pallet') {
    return boxDef({
      id: `dyn-pallet-${x.toFixed(1)}-${z.toFixed(1)}`,
      objectId: `dyn-pallet-${x.toFixed(1)}-${z.toFixed(1)}`,
      x,
      y: y + 0.08,
      z,
      hx: 0.6,
      hy: 0.08,
      hz: 0.6,
      material: 'wood',
      bodyType: 'dynamic',
      critical: false,
      dynamic: {
        mass: 8,
        friction: 0.55,
        restitution: 0.1,
        linearDamping: 0.6,
        angularDamping: 0.7,
        breakThreshold: null,
        impactSoundCategory: 'wood',
        canSleep: true,
        propKind: 'pallet',
      },
    });
  }
  // crate / cardboard box
  const fragileBox = fragile || kind === 'box';
  return boxDef({
    id: `dyn-crate-${x.toFixed(1)}-${z.toFixed(1)}`,
    objectId: `dyn-crate-${x.toFixed(1)}-${z.toFixed(1)}`,
    x,
    y: y + 0.35,
    z,
    hx: 0.35,
    hy: 0.35,
    hz: 0.35,
    material: fragileBox ? 'cardboard' : 'wood',
    bodyType: 'dynamic',
    critical: false,
    dynamic: {
      mass: fragileBox ? 2.5 : 6,
      friction: 0.5,
      restitution: 0.15,
      linearDamping: 0.45,
      angularDamping: 0.5,
      breakThreshold: fragileBox ? 4.5 : 12,
      impactSoundCategory: fragileBox ? 'cardboard' : 'wood',
      canSleep: true,
      propKind: fragileBox ? 'cardboardBox' : 'woodenCrate',
    },
  });
}

/** Filter colliders by quality while keeping collision-critical ones. */
export function filterCollidersForQuality(
  colliders: EnvironmentColliderDefinition[],
  quality: 'low' | 'medium' | 'high',
): EnvironmentColliderDefinition[] {
  return colliders.filter((c) => {
    if (c.collisionCritical) {
      return true;
    }
    const q = c.enabledByQuality ?? 'all';
    if (q === 'all') {
      return true;
    }
    if (quality === 'high') {
      return true;
    }
    if (quality === 'medium') {
      return q !== 'high';
    }
    // low: only critical (already returned) or explicitly low
    return q === 'low';
  });
}

export function placementKey(p: PlacementInstance): string {
  return `${p.x.toFixed(2)}:${p.z.toFixed(2)}`;
}
