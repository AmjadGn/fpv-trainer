import {
  asRestartPointId,
  asSpawnPointId,
  asZoneId,
  type GameplaySpatialDescription,
  type HardBoundary,
  type PlayableBoundary,
  type SoftWarningBoundary,
} from '@fpv/location-domain';

import { RESTART_IDS, SPAWN_IDS, ZONE_IDS } from './identity';
import { COASTAL_RUINS_LAYOUT, IDENTITY_QUAT } from './layout';

const L = COASTAL_RUINS_LAYOUT;

export const MEDITERRANEAN_PLAYABLE_BOUNDARY: PlayableBoundary = {
  shape: { kind: 'aabb', aabb: L.playableBounds },
};

export const MEDITERRANEAN_SOFT_WARNING_BOUNDARY: SoftWarningBoundary = {
  shape: { kind: 'aabb', aabb: L.softWarningBounds },
};

export const MEDITERRANEAN_HARD_BOUNDARY: HardBoundary = {
  shape: { kind: 'aabb', aabb: L.hardBounds },
};

export const MEDITERRANEAN_GAMEPLAY_SPATIAL: GameplaySpatialDescription = {
  zones: [
    {
      id: asZoneId(ZONE_IDS.coastalRuinsMission),
      kind: 'mission',
      displayName: 'Coastal Ruins',
      shape: { kind: 'aabb', aabb: L.playableBounds },
      tags: ['subregion', 'coastal-ruins', 'playable'],
    },
    {
      id: asZoneId(ZONE_IDS.archObjective),
      kind: 'objective',
      displayName: 'Stone Sea Arch Approach',
      shape: {
        kind: 'sphere',
        sphere: {
          center: {
            x: L.stoneArch.position.x,
            y: L.stoneArch.openingCenterY,
            z: L.stoneArch.position.z + 12,
          },
          radiusMeters: 14,
        },
      },
      tags: ['photography', 'arch'],
    },
    {
      id: asZoneId(ZONE_IDS.lookoutObjective),
      kind: 'objective',
      displayName: 'Lookout Framing Pocket',
      shape: {
        kind: 'sphere',
        sphere: {
          center: {
            x: L.lookoutTower.position.x - 10,
            y: L.lookoutTower.shaftCenterY,
            z: L.lookoutTower.position.z + 8,
          },
          radiusMeters: 12,
        },
      },
      tags: ['photography', 'lookout'],
    },
    {
      id: asZoneId(ZONE_IDS.cliffObjective),
      kind: 'objective',
      displayName: 'Cliffside Composition Pocket',
      shape: {
        kind: 'sphere',
        sphere: {
          center: {
            x: L.cliffsideRuin.position.x + 10,
            y: L.cliffsideRuin.position.y + 2,
            z: L.cliffsideRuin.position.z + 10,
          },
          radiusMeters: 12,
        },
      },
      tags: ['photography', 'cliff'],
    },
    {
      id: asZoneId(ZONE_IDS.shorelineRoute),
      kind: 'mission',
      displayName: 'Low-Altitude Shoreline Route',
      shape: { kind: 'aabb', aabb: {
        min: {
          x: L.shorelineRoute.center.x - L.shorelineRoute.halfExtents.x,
          y: L.shorelineRoute.center.y - L.shorelineRoute.halfExtents.y,
          z: L.shorelineRoute.center.z - L.shorelineRoute.halfExtents.z,
        },
        max: {
          x: L.shorelineRoute.center.x + L.shorelineRoute.halfExtents.x,
          y: L.shorelineRoute.center.y + L.shorelineRoute.halfExtents.y,
          z: L.shorelineRoute.center.z + L.shorelineRoute.halfExtents.z,
        },
      } },
      tags: ['shoreline', 'low-altitude'],
    },
  ],
  altitudeBands: [
    { label: 'shoreline-low', range: { minMeters: 0.5, maxMeters: 6 }, tags: ['shoreline'] },
    { label: 'mid-ruins', range: { minMeters: 6, maxMeters: 25 }, tags: ['ruins'] },
    { label: 'vantage', range: { minMeters: 25, maxMeters: 55 }, tags: ['vantage'] },
  ],
  spawnPoints: [
    {
      id: asSpawnPointId(SPAWN_IDS.main),
      displayName: 'Coastal Ruins Safe Spawn',
      pose: {
        position: { ...L.spawn.position },
        orientation: IDENTITY_QUAT,
      },
    },
  ],
  restartPoints: [
    {
      id: asRestartPointId(RESTART_IDS.main),
      displayName: 'Coastal Ruins Restart',
      pose: {
        position: { ...L.restart.position },
        orientation: IDENTITY_QUAT,
      },
    },
  ],
};
