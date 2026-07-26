/**
 * Explicit collision descriptors for Coastal Ruins.
 * Separate from visual meshes — visual geometry is never collision authority.
 */

import type { CollisionGroupId } from '../../../core/physics/models/collision-groups';
import {
  CollisionGroup,
  STATIC_COLLIDES_WITH,
  TERRAIN_COLLIDES_WITH,
} from '../../../core/physics/models/collision-groups';
import type {
  CollisionMaterialId,
  EnvironmentColliderDefinition,
} from '../../../core/physics/models/collision.models';

import { ASSET_IDS } from './identity';
import { COASTAL_RUINS_LAYOUT, IDENTITY_QUAT } from './layout';

export type CuratedColliderCategory =
  | 'terrain'
  | 'static-environment'
  | 'subject-geometry'
  | 'boundary-protection'
  | 'decorative-non-authoritative'
  | 'mission-sensor';

export interface CuratedCollisionDescriptor {
  readonly id: string;
  readonly assetRefId: string;
  readonly category: CuratedColliderCategory;
  readonly definition: EnvironmentColliderDefinition;
}

const L = COASTAL_RUINS_LAYOUT;

function box(
  id: string,
  objectId: string,
  position: { x: number; y: number; z: number },
  halfExtents: { x: number; y: number; z: number },
  group: CollisionGroupId,
  collidesWith: number,
  material: CollisionMaterialId,
  options?: { sensor?: boolean; critical?: boolean },
): EnvironmentColliderDefinition {
  return {
    id,
    objectId,
    bodyType: 'fixed',
    shape: {
      kind: 'box',
      halfExtents: { ...halfExtents },
    },
    position: { ...position },
    rotation: { ...IDENTITY_QUAT },
    material,
    collisionGroup: group,
    collidesWith,
    sensor: options?.sensor,
    collisionCritical: options?.critical ?? true,
    enabledByQuality: 'all',
  };
}

/**
 * Builds authoritative collision content for Coastal Ruins.
 * Quality tier must not change this geometry.
 */
export function buildCoastalRuinsCollisionDescriptors(): readonly CuratedCollisionDescriptor[] {
  const out: CuratedCollisionDescriptor[] = [];

  out.push({
    id: 'curated:terrain-ground',
    assetRefId: ASSET_IDS.terrainCollision,
    category: 'terrain',
    definition: box(
      'curated:terrain-ground',
      'mer-terrain',
      {
        x: L.terrain.position.x,
        y: L.terrain.position.y,
        z: L.terrain.position.z,
      },
      L.terrain.halfExtents,
      CollisionGroup.TERRAIN,
      TERRAIN_COLLIDES_WITH,
      'rock',
    ),
  });

  out.push({
    id: 'curated:cliff-face',
    assetRefId: ASSET_IDS.cliffCollision,
    category: 'static-environment',
    definition: box(
      'curated:cliff-face',
      'mer-cliff',
      {
        x: L.cliff.center.x,
        y: L.cliff.center.y,
        z: L.cliff.center.z,
      },
      {
        x: L.cliff.lengthX / 2,
        y: L.cliff.heightY / 2,
        z: L.cliff.depthZ / 2,
      },
      CollisionGroup.STATIC_STRUCTURE,
      STATIC_COLLIDES_WITH,
      'rock',
    ),
  });

  // Arch: two pillars + lintel (opening remains clear for LOS).
  const arch = L.stoneArch;
  const pillarHalfX = (arch.outerHalfExtents.x - arch.openingHalfExtents.x) / 2;
  const pillarXOffset = arch.openingHalfExtents.x + pillarHalfX;
  out.push({
    id: 'curated:arch-pillar-l',
    assetRefId: ASSET_IDS.archCollision,
    category: 'subject-geometry',
    definition: box(
      'curated:arch-pillar-l',
      'mer-arch',
      {
        x: arch.position.x - pillarXOffset,
        y: arch.outerHalfExtents.y,
        z: arch.position.z,
      },
      {
        x: pillarHalfX,
        y: arch.outerHalfExtents.y,
        z: arch.outerHalfExtents.z,
      },
      CollisionGroup.STATIC_STRUCTURE,
      STATIC_COLLIDES_WITH,
      'concrete',
    ),
  });
  out.push({
    id: 'curated:arch-pillar-r',
    assetRefId: ASSET_IDS.archCollision,
    category: 'subject-geometry',
    definition: box(
      'curated:arch-pillar-r',
      'mer-arch',
      {
        x: arch.position.x + pillarXOffset,
        y: arch.outerHalfExtents.y,
        z: arch.position.z,
      },
      {
        x: pillarHalfX,
        y: arch.outerHalfExtents.y,
        z: arch.outerHalfExtents.z,
      },
      CollisionGroup.STATIC_STRUCTURE,
      STATIC_COLLIDES_WITH,
      'concrete',
    ),
  });
  out.push({
    id: 'curated:arch-lintel',
    assetRefId: ASSET_IDS.archCollision,
    category: 'subject-geometry',
    definition: box(
      'curated:arch-lintel',
      'mer-arch',
      {
        x: arch.position.x,
        y: arch.outerHalfExtents.y * 2 - 0.6,
        z: arch.position.z,
      },
      {
        x: arch.outerHalfExtents.x,
        y: 0.6,
        z: arch.outerHalfExtents.z,
      },
      CollisionGroup.STATIC_STRUCTURE,
      STATIC_COLLIDES_WITH,
      'concrete',
    ),
  });

  // Lookout tower
  const tower = L.lookoutTower;
  out.push({
    id: 'curated:tower-base',
    assetRefId: ASSET_IDS.towerCollision,
    category: 'subject-geometry',
    definition: box(
      'curated:tower-base',
      'mer-tower',
      {
        x: tower.position.x,
        y: tower.baseHalfExtents.y,
        z: tower.position.z,
      },
      tower.baseHalfExtents,
      CollisionGroup.STATIC_STRUCTURE,
      STATIC_COLLIDES_WITH,
      'concrete',
    ),
  });
  out.push({
    id: 'curated:tower-shaft',
    assetRefId: ASSET_IDS.towerCollision,
    category: 'subject-geometry',
    definition: box(
      'curated:tower-shaft',
      'mer-tower',
      {
        x: tower.position.x,
        y: tower.shaftCenterY,
        z: tower.position.z,
      },
      tower.shaftHalfExtents,
      CollisionGroup.STATIC_STRUCTURE,
      STATIC_COLLIDES_WITH,
      'concrete',
    ),
  });

  // Cliffside ruin wall
  const cliffRuin = L.cliffsideRuin;
  out.push({
    id: 'curated:cliffside-wall',
    assetRefId: ASSET_IDS.wallsCollision,
    category: 'subject-geometry',
    definition: box(
      'curated:cliffside-wall',
      'mer-cliffside',
      {
        x: cliffRuin.position.x,
        y: cliffRuin.position.y + cliffRuin.wallHalfExtents.y,
        z: cliffRuin.position.z,
      },
      cliffRuin.wallHalfExtents,
      CollisionGroup.STATIC_STRUCTURE,
      STATIC_COLLIDES_WITH,
      'concrete',
    ),
  });

  L.walls.forEach((wall, i) => {
    out.push({
      id: `curated:wall-${i}`,
      assetRefId: ASSET_IDS.wallsCollision,
      category: 'static-environment',
      definition: box(
        `curated:wall-${i}`,
        'mer-walls',
        {
          x: wall.position.x,
          y: wall.position.y,
          z: wall.position.z,
        },
        wall.halfExtents,
        CollisionGroup.STATIC_STRUCTURE,
        STATIC_COLLIDES_WITH,
        'concrete',
      ),
    });
  });

  // Rock passage
  out.push({
    id: 'curated:passage-left',
    assetRefId: ASSET_IDS.rocksCollision,
    category: 'static-environment',
    definition: box(
      'curated:passage-left',
      'mer-passage',
      L.rockPassage.left.position,
      L.rockPassage.left.halfExtents,
      CollisionGroup.STATIC_STRUCTURE,
      STATIC_COLLIDES_WITH,
      'rock',
    ),
  });
  out.push({
    id: 'curated:passage-right',
    assetRefId: ASSET_IDS.rocksCollision,
    category: 'static-environment',
    definition: box(
      'curated:passage-right',
      'mer-passage',
      L.rockPassage.right.position,
      L.rockPassage.right.halfExtents,
      CollisionGroup.STATIC_STRUCTURE,
      STATIC_COLLIDES_WITH,
      'rock',
    ),
  });

  L.majorRocks.forEach((rock, i) => {
    out.push({
      id: `curated:rock-${i}`,
      assetRefId: ASSET_IDS.rocksCollision,
      category: 'static-environment',
      definition: box(
        `curated:rock-${i}`,
        'mer-rocks',
        rock.position,
        rock.halfExtents,
        CollisionGroup.STATIC_STRUCTURE,
        STATIC_COLLIDES_WITH,
        'rock',
      ),
    });
  });

  // Soft boundary protection volumes (optional sensors / thin walls at hard edges)
  const hb = L.hardBounds;
  const wallT = 1.5;
  const midY = (hb.min.y + hb.max.y) / 2;
  const height = (hb.max.y - hb.min.y) / 2;
  const midZ = (hb.min.z + hb.max.z) / 2;
  const depth = (hb.max.z - hb.min.z) / 2;
  const midX = (hb.min.x + hb.max.x) / 2;
  const width = (hb.max.x - hb.min.x) / 2;

  const boundaryBoxes: Array<{
    id: string;
    position: { x: number; y: number; z: number };
    half: { x: number; y: number; z: number };
  }> = [
    {
      id: 'curated:boundary-x-min',
      position: { x: hb.min.x - wallT / 2, y: midY, z: midZ },
      half: { x: wallT / 2, y: height, z: depth },
    },
    {
      id: 'curated:boundary-x-max',
      position: { x: hb.max.x + wallT / 2, y: midY, z: midZ },
      half: { x: wallT / 2, y: height, z: depth },
    },
    {
      id: 'curated:boundary-z-min',
      position: { x: midX, y: midY, z: hb.min.z - wallT / 2 },
      half: { x: width, y: height, z: wallT / 2 },
    },
    {
      id: 'curated:boundary-z-max',
      position: { x: midX, y: midY, z: hb.max.z + wallT / 2 },
      half: { x: width, y: height, z: wallT / 2 },
    },
  ];

  for (const b of boundaryBoxes) {
    out.push({
      id: b.id,
      assetRefId: ASSET_IDS.boundaryCollision,
      category: 'boundary-protection',
      definition: box(
        b.id,
        'mer-boundary',
        b.position,
        b.half,
        CollisionGroup.STATIC_STRUCTURE,
        STATIC_COLLIDES_WITH,
        'concrete',
      ),
    });
  }

  return out;
}

/** Stable collider count for budgets / diagnostics. */
export const COASTAL_RUINS_COLLIDER_BUDGET = {
  expectedMin: 18,
  expectedMax: 32,
  triangleEstimate: 0, // boxes only
} as const;
